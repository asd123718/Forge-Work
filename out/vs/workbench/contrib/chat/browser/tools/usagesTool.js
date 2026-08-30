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
import { Codicon } from "../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { escapeRegExpCharacters } from "../../../../../base/common/strings.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isEqual, relativePath } from "../../../../../base/common/resources.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { getDefinitionsAtPosition, getImplementationsAtPosition, getReferencesAtPosition } from "../../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { ISearchService, QueryType, resultIsMatch } from "../../../../services/search/common/search.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { createToolSimpleTextResult } from "../../common/tools/builtinTools/toolHelpers.js";
import { errorResult, findLineNumber, findSymbolColumn, resolveSymbolToolFileUri } from "./toolHelpers.js";
const UsagesToolId = "vscode_listCodeUsages";
const BaseModelDescription = `Find all usages (references, definitions, and implementations) of a code symbol across the workspace. This tool locates where a symbol is referenced, defined, or implemented.

Input:
- "symbol": The exact name of the symbol to search for (function, class, method, variable, type, etc.).
- "uri": A full URI (e.g. "file:///path/to/file.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "filePath": A workspace-relative file path (e.g. "src/utils/helpers.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "lineContent": A substring of the line of code where the symbol appears. This is used to locate the exact position in the file. Must be the actual text from the file - do NOT fabricate it.

IMPORTANT: The file and line do NOT need to be the definition of the symbol. Any occurrence works - a usage, an import, a call site, etc. You can pick whichever occurrence is most convenient.

If the tool returns an error, retry with corrected input - ensure the file path is correct, the line content matches the actual file content, and the symbol name appears in that line.`;
const StaticModelDescription = BaseModelDescription + `

If the file's language has no reference provider registered, the tool returns an error.`;
let UsagesTool = class extends Disposable {
  constructor(_languageFeaturesService, _modelService, _searchService, _textModelService, _workspaceContextService) {
    super();
    this._languageFeaturesService = _languageFeaturesService;
    this._modelService = _modelService;
    this._searchService = _searchService;
    this._textModelService = _textModelService;
    this._workspaceContextService = _workspaceContextService;
  }
  getToolData() {
    return this._buildToolData(
      StaticModelDescription,
      localize("tool.usages.userDescription", "Find references, definitions, and implementations of a symbol")
    );
  }
  _buildToolData(modelDescription, userDescription) {
    return {
      id: UsagesToolId,
      toolReferenceName: "usages",
      canBeReferencedInPrompt: false,
      icon: ThemeIcon.fromId(Codicon.references.id),
      displayName: localize("tool.usages.displayName", "List Code Usages"),
      userDescription,
      modelDescription,
      source: ToolDataSource.Internal,
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "The exact name of the symbol (function, class, method, variable, type, etc.) to find usages of."
          },
          uri: {
            type: "string",
            description: 'A full URI of a file where the symbol appears (e.g. "file:///path/to/file.ts"). Provide either "uri" or "filePath".'
          },
          filePath: {
            type: "string",
            description: 'A workspace-relative file path where the symbol appears (e.g. "src/utils/helpers.ts"). Provide either "uri" or "filePath".'
          },
          lineContent: {
            type: "string",
            description: "A substring of the line of code where the symbol appears. Used to locate the exact position. Must be actual text from the file."
          }
        },
        required: ["symbol", "lineContent"]
      }
    };
  }
  async prepareToolInvocation(context, _token) {
    const input = context.parameters;
    return {
      invocationMessage: localize("tool.usages.invocationMessage", "Analyzing usages of `{0}`", input.symbol)
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const input = invocation.parameters;
    const uri = resolveSymbolToolFileUri(input, this._workspaceContextService, invocation.context?.workingDirectory);
    if (!uri) {
      return errorResult('Provide either "uri" (a full URI) or "filePath" (a workspace-relative path) to identify the file.');
    }
    const ref = await this._textModelService.createModelReference(uri);
    try {
      const model = ref.object.textEditorModel;
      if (!this._languageFeaturesService.referenceProvider.has(model)) {
        return errorResult(`No reference provider available for this file's language. The usages tool may not support this language.`);
      }
      const lineNumber = findLineNumber(model, input.lineContent);
      if (lineNumber === void 0) {
        return errorResult(`Could not find line content "${input.lineContent}" in ${uri.toString()}. Provide the exact text from the line where the symbol appears.`);
      }
      const lineText = model.getLineContent(lineNumber);
      const column = findSymbolColumn(lineText, input.symbol);
      if (column === void 0) {
        return errorResult(`Could not find symbol "${input.symbol}" in the matched line. Ensure the symbol name is correct and appears in the provided line content.`);
      }
      const position = new Position(lineNumber, column);
      const [definitions, references, implementations] = await Promise.all([
        getDefinitionsAtPosition(this._languageFeaturesService.definitionProvider, model, position, false, token),
        getReferencesAtPosition(this._languageFeaturesService.referenceProvider, model, position, false, false, token),
        getImplementationsAtPosition(this._languageFeaturesService.implementationProvider, model, position, false, token)
      ]);
      if (references.length === 0) {
        const result2 = createToolSimpleTextResult(`No usages found for \`${input.symbol}\`.`);
        result2.toolResultMessage = new MarkdownString(localize("tool.usages.noResults", "Analyzed usages of `{0}`, no results", input.symbol));
        return result2;
      }
      const previews = await this._getLinePreviews(input.symbol, references, token);
      const lines = [];
      lines.push(`${references.length} usages of \`${input.symbol}\`:
`);
      for (let i = 0; i < references.length; i++) {
        const ref2 = references[i];
        const kind = this._classifyReference(ref2, definitions, implementations);
        const startLine = Range.lift(ref2.range).startLineNumber;
        const preview = previews[i];
        if (preview) {
          lines.push(`<usage type="${kind}" uri="${ref2.uri.toString()}" line="${startLine}">`);
          lines.push(`	${preview}`);
          lines.push(`</usage>`);
        } else {
          lines.push(`<usage type="${kind}" uri="${ref2.uri.toString()}" line="${startLine}" />`);
        }
      }
      const text = lines.join("\n");
      const result = createToolSimpleTextResult(text);
      result.toolResultMessage = references.length === 1 ? new MarkdownString(localize("tool.usages.oneResult", "Analyzed usages of `{0}`, 1 result", input.symbol)) : new MarkdownString(localize("tool.usages.results", "Analyzed usages of `{0}`, {1} results", input.symbol, references.length));
      result.toolResultDetails = references.map((r) => ({ uri: r.uri, range: r.range }));
      return result;
    } finally {
      ref.dispose();
    }
  }
  async _getLinePreviews(symbol, references, token) {
    const previews = new Array(references.length);
    const lookup = /* @__PURE__ */ new Map();
    const needSearch = new ResourceSet();
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      const lineNumber = Range.lift(ref.range).startLineNumber;
      const existingModel = this._modelService.getModel(ref.uri);
      if (existingModel) {
        previews[i] = existingModel.getLineContent(lineNumber).trim();
      } else {
        lookup.set(`${ref.uri.toString()}:${lineNumber}`, i);
        needSearch.add(ref.uri);
      }
    }
    if (needSearch.size === 0 || token.isCancellationRequested) {
      return previews;
    }
    try {
      const folders = this._workspaceContextService.getWorkspace().folders;
      const relativePaths = [];
      for (const uri of needSearch) {
        const folder = this._workspaceContextService.getWorkspaceFolder(uri);
        if (folder) {
          const rel = relativePath(folder.uri, uri);
          if (rel) {
            relativePaths.push(rel);
          }
        }
      }
      if (relativePaths.length > 0) {
        const includePattern = {};
        if (relativePaths.length === 1) {
          includePattern[relativePaths[0]] = true;
        } else {
          includePattern[`{${relativePaths.join(",")}}`] = true;
        }
        const searchResult = await this._searchService.textSearch(
          {
            type: QueryType.Text,
            contentPattern: { pattern: escapeRegExpCharacters(symbol), isRegExp: true, isWordMatch: true },
            folderQueries: folders.map((f) => ({ folder: f.uri })),
            includePattern
          },
          token
        );
        for (const fileMatch of searchResult.results) {
          if (!fileMatch.results) {
            continue;
          }
          for (const textMatch of fileMatch.results) {
            if (!resultIsMatch(textMatch)) {
              continue;
            }
            for (const range of textMatch.rangeLocations) {
              const lineNumber = range.source.startLineNumber + 1;
              const key = `${fileMatch.resource.toString()}:${lineNumber}`;
              const idx = lookup.get(key);
              if (idx !== void 0) {
                previews[idx] = textMatch.previewText.trim();
                lookup.delete(key);
              }
            }
          }
        }
      }
    } catch {
    }
    return previews;
  }
  _classifyReference(ref, definitions, implementations) {
    if (definitions.some((d) => this._overlaps(ref, d))) {
      return "definition";
    }
    if (implementations.some((d) => this._overlaps(ref, d))) {
      return "implementation";
    }
    return "reference";
  }
  _overlaps(a, b) {
    if (!isEqual(a.uri, b.uri)) {
      return false;
    }
    return Range.areIntersectingOrTouching(a.range, b.range);
  }
};
UsagesTool = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ISearchService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IWorkspaceContextService)
], UsagesTool);
let UsagesToolContribution = class extends Disposable {
  constructor(toolsService, instantiationService) {
    super();
    const usagesTool = this._store.add(instantiationService.createInstance(UsagesTool));
    this._store.add(toolsService.registerTool(usagesTool.getToolData(), usagesTool));
  }
};
UsagesToolContribution.ID = "chat.usagesTool";
UsagesToolContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInstantiationService)
], UsagesToolContribution);
export {
  UsagesTool,
  UsagesToolContribution,
  UsagesToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHRvb2xzXFx1c2FnZXNUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IExvY2F0aW9uLCBMb2NhdGlvbkxpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24sIGdldEltcGxlbWVudGF0aW9uc0F0UG9zaXRpb24sIGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2dvVG9TeW1ib2wuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFNlcnZpY2UsIFF1ZXJ5VHlwZSwgcmVzdWx0SXNNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcywgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUb29sU2ltcGxlVGV4dFJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvdG9vbEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgZXJyb3JSZXN1bHQsIGZpbmRMaW5lTnVtYmVyLCBmaW5kU3ltYm9sQ29sdW1uLCBJU3ltYm9sVG9vbElucHV0LCByZXNvbHZlU3ltYm9sVG9vbEZpbGVVcmkgfSBmcm9tICcuL3Rvb2xIZWxwZXJzLmpzJztcblxuZXhwb3J0IGNvbnN0IFVzYWdlc1Rvb2xJZCA9ICd2c2NvZGVfbGlzdENvZGVVc2FnZXMnO1xuXG5jb25zdCBCYXNlTW9kZWxEZXNjcmlwdGlvbiA9IGBGaW5kIGFsbCB1c2FnZXMgKHJlZmVyZW5jZXMsIGRlZmluaXRpb25zLCBhbmQgaW1wbGVtZW50YXRpb25zKSBvZiBhIGNvZGUgc3ltYm9sIGFjcm9zcyB0aGUgd29ya3NwYWNlLiBUaGlzIHRvb2wgbG9jYXRlcyB3aGVyZSBhIHN5bWJvbCBpcyByZWZlcmVuY2VkLCBkZWZpbmVkLCBvciBpbXBsZW1lbnRlZC5cblxuSW5wdXQ6XG4tIFwic3ltYm9sXCI6IFRoZSBleGFjdCBuYW1lIG9mIHRoZSBzeW1ib2wgdG8gc2VhcmNoIGZvciAoZnVuY3Rpb24sIGNsYXNzLCBtZXRob2QsIHZhcmlhYmxlLCB0eXBlLCBldGMuKS5cbi0gXCJ1cmlcIjogQSBmdWxsIFVSSSAoZS5nLiBcImZpbGU6Ly8vcGF0aC90by9maWxlLnRzXCIpIG9mIGEgZmlsZSB3aGVyZSB0aGUgc3ltYm9sIGFwcGVhcnMuIFByb3ZpZGUgZWl0aGVyIFwidXJpXCIgb3IgXCJmaWxlUGF0aFwiLlxuLSBcImZpbGVQYXRoXCI6IEEgd29ya3NwYWNlLXJlbGF0aXZlIGZpbGUgcGF0aCAoZS5nLiBcInNyYy91dGlscy9oZWxwZXJzLnRzXCIpIG9mIGEgZmlsZSB3aGVyZSB0aGUgc3ltYm9sIGFwcGVhcnMuIFByb3ZpZGUgZWl0aGVyIFwidXJpXCIgb3IgXCJmaWxlUGF0aFwiLlxuLSBcImxpbmVDb250ZW50XCI6IEEgc3Vic3RyaW5nIG9mIHRoZSBsaW5lIG9mIGNvZGUgd2hlcmUgdGhlIHN5bWJvbCBhcHBlYXJzLiBUaGlzIGlzIHVzZWQgdG8gbG9jYXRlIHRoZSBleGFjdCBwb3NpdGlvbiBpbiB0aGUgZmlsZS4gTXVzdCBiZSB0aGUgYWN0dWFsIHRleHQgZnJvbSB0aGUgZmlsZSAtIGRvIE5PVCBmYWJyaWNhdGUgaXQuXG5cbklNUE9SVEFOVDogVGhlIGZpbGUgYW5kIGxpbmUgZG8gTk9UIG5lZWQgdG8gYmUgdGhlIGRlZmluaXRpb24gb2YgdGhlIHN5bWJvbC4gQW55IG9jY3VycmVuY2Ugd29ya3MgLSBhIHVzYWdlLCBhbiBpbXBvcnQsIGEgY2FsbCBzaXRlLCBldGMuIFlvdSBjYW4gcGljayB3aGljaGV2ZXIgb2NjdXJyZW5jZSBpcyBtb3N0IGNvbnZlbmllbnQuXG5cbklmIHRoZSB0b29sIHJldHVybnMgYW4gZXJyb3IsIHJldHJ5IHdpdGggY29ycmVjdGVkIGlucHV0IC0gZW5zdXJlIHRoZSBmaWxlIHBhdGggaXMgY29ycmVjdCwgdGhlIGxpbmUgY29udGVudCBtYXRjaGVzIHRoZSBhY3R1YWwgZmlsZSBjb250ZW50LCBhbmQgdGhlIHN5bWJvbCBuYW1lIGFwcGVhcnMgaW4gdGhhdCBsaW5lLmA7XG5cbi8qKlxuICogU3RhdGljIGRlc2NyaXB0aW9uIHRoYXQgZG9lcyBub3QgZGVwZW5kIG9uIHRoZSBzZXQgb2YgcmVnaXN0ZXJlZCByZWZlcmVuY2VcbiAqIHByb3ZpZGVycywgc28gaXQgc3RheXMgYnl0ZS1zdGFibGUgYWNyb3NzIHJlcXVlc3RzIGFzIGxhbmd1YWdlIGV4dGVuc2lvbnNcbiAqIGFjdGl2YXRlIGR1cmluZyBhIHR1cm4uXG4gKi9cbmNvbnN0IFN0YXRpY01vZGVsRGVzY3JpcHRpb24gPSBCYXNlTW9kZWxEZXNjcmlwdGlvbiArIGBcblxuSWYgdGhlIGZpbGUncyBsYW5ndWFnZSBoYXMgbm8gcmVmZXJlbmNlIHByb3ZpZGVyIHJlZ2lzdGVyZWQsIHRoZSB0b29sIHJldHVybnMgYW4gZXJyb3IuYDtcblxuZXhwb3J0IGNsYXNzIFVzYWdlc1Rvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJU2VhcmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0VG9vbERhdGEoKTogSVRvb2xEYXRhIHtcblx0XHRyZXR1cm4gdGhpcy5fYnVpbGRUb29sRGF0YShcblx0XHRcdFN0YXRpY01vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRsb2NhbGl6ZSgndG9vbC51c2FnZXMudXNlckRlc2NyaXB0aW9uJywgJ0ZpbmQgcmVmZXJlbmNlcywgZGVmaW5pdGlvbnMsIGFuZCBpbXBsZW1lbnRhdGlvbnMgb2YgYSBzeW1ib2wnKSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRUb29sRGF0YShtb2RlbERlc2NyaXB0aW9uOiBzdHJpbmcsIHVzZXJEZXNjcmlwdGlvbjogc3RyaW5nKTogSVRvb2xEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IFVzYWdlc1Rvb2xJZCxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndXNhZ2VzJyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5yZWZlcmVuY2VzLmlkKSxcblx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbC51c2FnZXMuZGlzcGxheU5hbWUnLCAnTGlzdCBDb2RlIFVzYWdlcycpLFxuXHRcdFx0dXNlckRlc2NyaXB0aW9uLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHN5bWJvbDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBleGFjdCBuYW1lIG9mIHRoZSBzeW1ib2wgKGZ1bmN0aW9uLCBjbGFzcywgbWV0aG9kLCB2YXJpYWJsZSwgdHlwZSwgZXRjLikgdG8gZmluZCB1c2FnZXMgb2YuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dXJpOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQSBmdWxsIFVSSSBvZiBhIGZpbGUgd2hlcmUgdGhlIHN5bWJvbCBhcHBlYXJzIChlLmcuIFwiZmlsZTovLy9wYXRoL3RvL2ZpbGUudHNcIikuIFByb3ZpZGUgZWl0aGVyIFwidXJpXCIgb3IgXCJmaWxlUGF0aFwiLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZpbGVQYXRoOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQSB3b3Jrc3BhY2UtcmVsYXRpdmUgZmlsZSBwYXRoIHdoZXJlIHRoZSBzeW1ib2wgYXBwZWFycyAoZS5nLiBcInNyYy91dGlscy9oZWxwZXJzLnRzXCIpLiBQcm92aWRlIGVpdGhlciBcInVyaVwiIG9yIFwiZmlsZVBhdGhcIi4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsaW5lQ29udGVudDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Egc3Vic3RyaW5nIG9mIHRoZSBsaW5lIG9mIGNvZGUgd2hlcmUgdGhlIHN5bWJvbCBhcHBlYXJzLiBVc2VkIHRvIGxvY2F0ZSB0aGUgZXhhY3QgcG9zaXRpb24uIE11c3QgYmUgYWN0dWFsIHRleHQgZnJvbSB0aGUgZmlsZS4nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydzeW1ib2wnLCAnbGluZUNvbnRlbnQnXVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGlucHV0ID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElTeW1ib2xUb29sSW5wdXQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbC51c2FnZXMuaW52b2NhdGlvbk1lc3NhZ2UnLCAnQW5hbHl6aW5nIHVzYWdlcyBvZiBgezB9YCcsIGlucHV0LnN5bWJvbCksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBpbnB1dCA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJU3ltYm9sVG9vbElucHV0O1xuXG5cdFx0Ly8gLS0tIHJlc29sdmUgVVJJIC0tLVxuXHRcdGNvbnN0IHVyaSA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaShpbnB1dCwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGludm9jYXRpb24uY29udGV4dD8ud29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybiBlcnJvclJlc3VsdCgnUHJvdmlkZSBlaXRoZXIgXCJ1cmlcIiAoYSBmdWxsIFVSSSkgb3IgXCJmaWxlUGF0aFwiIChhIHdvcmtzcGFjZS1yZWxhdGl2ZSBwYXRoKSB0byBpZGVudGlmeSB0aGUgZmlsZS4nKTtcblx0XHR9XG5cblx0XHQvLyAtLS0gb3BlbiB0ZXh0IG1vZGVsIC0tLVxuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0aWYgKCF0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlci5oYXMobW9kZWwpKSB7XG5cdFx0XHRcdHJldHVybiBlcnJvclJlc3VsdChgTm8gcmVmZXJlbmNlIHByb3ZpZGVyIGF2YWlsYWJsZSBmb3IgdGhpcyBmaWxlJ3MgbGFuZ3VhZ2UuIFRoZSB1c2FnZXMgdG9vbCBtYXkgbm90IHN1cHBvcnQgdGhpcyBsYW5ndWFnZS5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tIGZpbmQgbGluZSBjb250YWluaW5nIGxpbmVDb250ZW50IC0tLVxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGZpbmRMaW5lTnVtYmVyKG1vZGVsLCBpbnB1dC5saW5lQ29udGVudCk7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBlcnJvclJlc3VsdChgQ291bGQgbm90IGZpbmQgbGluZSBjb250ZW50IFwiJHtpbnB1dC5saW5lQ29udGVudH1cIiBpbiAke3VyaS50b1N0cmluZygpfS4gUHJvdmlkZSB0aGUgZXhhY3QgdGV4dCBmcm9tIHRoZSBsaW5lIHdoZXJlIHRoZSBzeW1ib2wgYXBwZWFycy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tIGZpbmQgc3ltYm9sIGluIHRoYXQgbGluZSAtLS1cblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBjb2x1bW4gPSBmaW5kU3ltYm9sQ29sdW1uKGxpbmVUZXh0LCBpbnB1dC5zeW1ib2wpO1xuXHRcdFx0aWYgKGNvbHVtbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBlcnJvclJlc3VsdChgQ291bGQgbm90IGZpbmQgc3ltYm9sIFwiJHtpbnB1dC5zeW1ib2x9XCIgaW4gdGhlIG1hdGNoZWQgbGluZS4gRW5zdXJlIHRoZSBzeW1ib2wgbmFtZSBpcyBjb3JyZWN0IGFuZCBhcHBlYXJzIGluIHRoZSBwcm92aWRlZCBsaW5lIGNvbnRlbnQuYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cblx0XHRcdC8vIC0tLSBxdWVyeSByZWZlcmVuY2VzLCBkZWZpbml0aW9ucywgaW1wbGVtZW50YXRpb25zIGluIHBhcmFsbGVsIC0tLVxuXHRcdFx0Y29uc3QgW2RlZmluaXRpb25zLCByZWZlcmVuY2VzLCBpbXBsZW1lbnRhdGlvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRnZXREZWZpbml0aW9uc0F0UG9zaXRpb24odGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIGZhbHNlLCB0b2tlbiksXG5cdFx0XHRcdGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIGZhbHNlLCBmYWxzZSwgdG9rZW4pLFxuXHRcdFx0XHRnZXRJbXBsZW1lbnRhdGlvbnNBdFBvc2l0aW9uKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmltcGxlbWVudGF0aW9uUHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgZmFsc2UsIHRva2VuKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAocmVmZXJlbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlVG9vbFNpbXBsZVRleHRSZXN1bHQoYE5vIHVzYWdlcyBmb3VuZCBmb3IgXFxgJHtpbnB1dC5zeW1ib2x9XFxgLmApO1xuXHRcdFx0XHRyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3Rvb2wudXNhZ2VzLm5vUmVzdWx0cycsICdBbmFseXplZCB1c2FnZXMgb2YgYHswfWAsIG5vIHJlc3VsdHMnLCBpbnB1dC5zeW1ib2wpKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tIGNsYXNzaWZ5IGFuZCBmb3JtYXQgcmVzdWx0cyB3aXRoIHByZXZpZXdzIC0tLVxuXHRcdFx0Y29uc3QgcHJldmlld3MgPSBhd2FpdCB0aGlzLl9nZXRMaW5lUHJldmlld3MoaW5wdXQuc3ltYm9sLCByZWZlcmVuY2VzLCB0b2tlbik7XG5cblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0bGluZXMucHVzaChgJHtyZWZlcmVuY2VzLmxlbmd0aH0gdXNhZ2VzIG9mIFxcYCR7aW5wdXQuc3ltYm9sfVxcYDpcXG5gKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZWZlcmVuY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHJlZiA9IHJlZmVyZW5jZXNbaV07XG5cdFx0XHRcdGNvbnN0IGtpbmQgPSB0aGlzLl9jbGFzc2lmeVJlZmVyZW5jZShyZWYsIGRlZmluaXRpb25zLCBpbXBsZW1lbnRhdGlvbnMpO1xuXHRcdFx0XHRjb25zdCBzdGFydExpbmUgPSBSYW5nZS5saWZ0KHJlZi5yYW5nZSkuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRjb25zdCBwcmV2aWV3ID0gcHJldmlld3NbaV07XG5cdFx0XHRcdGlmIChwcmV2aWV3KSB7XG5cdFx0XHRcdFx0bGluZXMucHVzaChgPHVzYWdlIHR5cGU9XCIke2tpbmR9XCIgdXJpPVwiJHtyZWYudXJpLnRvU3RyaW5nKCl9XCIgbGluZT1cIiR7c3RhcnRMaW5lfVwiPmApO1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goYFxcdCR7cHJldmlld31gKTtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKGA8L3VzYWdlPmApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goYDx1c2FnZSB0eXBlPVwiJHtraW5kfVwiIHVyaT1cIiR7cmVmLnVyaS50b1N0cmluZygpfVwiIGxpbmU9XCIke3N0YXJ0TGluZX1cIiAvPmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRleHQgPSBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZVRvb2xTaW1wbGVUZXh0UmVzdWx0KHRleHQpO1xuXG5cdFx0XHRyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UgPSByZWZlcmVuY2VzLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndG9vbC51c2FnZXMub25lUmVzdWx0JywgJ0FuYWx5emVkIHVzYWdlcyBvZiBgezB9YCwgMSByZXN1bHQnLCBpbnB1dC5zeW1ib2wpKVxuXHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndG9vbC51c2FnZXMucmVzdWx0cycsICdBbmFseXplZCB1c2FnZXMgb2YgYHswfWAsIHsxfSByZXN1bHRzJywgaW5wdXQuc3ltYm9sLCByZWZlcmVuY2VzLmxlbmd0aCkpO1xuXG5cdFx0XHRyZXN1bHQudG9vbFJlc3VsdERldGFpbHMgPSByZWZlcmVuY2VzLm1hcCgocik6IExvY2F0aW9uID0+ICh7IHVyaTogci51cmksIHJhbmdlOiByLnJhbmdlIH0pKTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRMaW5lUHJldmlld3Moc3ltYm9sOiBzdHJpbmcsIHJlZmVyZW5jZXM6IExvY2F0aW9uTGlua1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPChzdHJpbmcgfCB1bmRlZmluZWQpW10+IHtcblx0XHRjb25zdCBwcmV2aWV3czogKHN0cmluZyB8IHVuZGVmaW5lZClbXSA9IG5ldyBBcnJheShyZWZlcmVuY2VzLmxlbmd0aCk7XG5cblx0XHQvLyBCdWlsZCBhIGxvb2t1cDogKHVyaVN0cmluZywgbGluZU51bWJlcikgXHUyMTkyIGluZGV4IGluIHJlZmVyZW5jZXMgYXJyYXlcblx0XHRjb25zdCBsb29rdXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGNvbnN0IG5lZWRTZWFyY2ggPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVmZXJlbmNlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcmVmID0gcmVmZXJlbmNlc1tpXTtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBSYW5nZS5saWZ0KHJlZi5yYW5nZSkuc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHQvLyBUcnkgYWxyZWFkeS1vcGVuIG1vZGVscyBmaXJzdFxuXHRcdFx0Y29uc3QgZXhpc3RpbmdNb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZWYudXJpKTtcblx0XHRcdGlmIChleGlzdGluZ01vZGVsKSB7XG5cdFx0XHRcdHByZXZpZXdzW2ldID0gZXhpc3RpbmdNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKS50cmltKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb29rdXAuc2V0KGAke3JlZi51cmkudG9TdHJpbmcoKX06JHtsaW5lTnVtYmVyfWAsIGkpO1xuXHRcdFx0XHRuZWVkU2VhcmNoLmFkZChyZWYudXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmVlZFNlYXJjaC5zaXplID09PSAwIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gcHJldmlld3M7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIElTZWFyY2hTZXJ2aWNlIHRvIHNlYXJjaCBmb3IgdGhlIHN5bWJvbCBuYW1lLCByZXN0cmljdGVkIHRvIHRoZVxuXHRcdC8vIHJlZmVyZW5jZWQgZmlsZXMuIFRoaXMgaXMgYmFja2VkIGJ5IHJpcGdyZXAgZm9yIGZpbGU6Ly8gVVJJcy5cblx0XHR0cnkge1xuXHRcdFx0Ly8gQnVpbGQgaW5jbHVkZVBhdHRlcm4gZnJvbSB3b3Jrc3BhY2UtcmVsYXRpdmUgcGF0aHNcblx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdFx0Y29uc3QgcmVsYXRpdmVQYXRoczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIG5lZWRTZWFyY2gpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHVyaSk7XG5cdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHRjb25zdCByZWwgPSByZWxhdGl2ZVBhdGgoZm9sZGVyLnVyaSwgdXJpKTtcblx0XHRcdFx0XHRpZiAocmVsKSB7XG5cdFx0XHRcdFx0XHRyZWxhdGl2ZVBhdGhzLnB1c2gocmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlbGF0aXZlUGF0aHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBpbmNsdWRlUGF0dGVybjogUmVjb3JkPHN0cmluZywgdHJ1ZT4gPSB7fTtcblx0XHRcdFx0aWYgKHJlbGF0aXZlUGF0aHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm5bcmVsYXRpdmVQYXRoc1swXV0gPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuW2B7JHtyZWxhdGl2ZVBhdGhzLmpvaW4oJywnKX19YF0gPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2VhcmNoUmVzdWx0ID0gYXdhaXQgdGhpcy5fc2VhcmNoU2VydmljZS50ZXh0U2VhcmNoKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRcdFx0Y29udGVudFBhdHRlcm46IHsgcGF0dGVybjogZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhzeW1ib2wpLCBpc1JlZ0V4cDogdHJ1ZSwgaXNXb3JkTWF0Y2g6IHRydWUgfSxcblx0XHRcdFx0XHRcdGZvbGRlclF1ZXJpZXM6IGZvbGRlcnMubWFwKGYgPT4gKHsgZm9sZGVyOiBmLnVyaSB9KSksXG5cdFx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRva2VuLFxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZU1hdGNoIG9mIHNlYXJjaFJlc3VsdC5yZXN1bHRzKSB7XG5cdFx0XHRcdFx0aWYgKCFmaWxlTWF0Y2gucmVzdWx0cykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgdGV4dE1hdGNoIG9mIGZpbGVNYXRjaC5yZXN1bHRzKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXJlc3VsdElzTWF0Y2godGV4dE1hdGNoKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgdGV4dE1hdGNoLnJhbmdlTG9jYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSByYW5nZS5zb3VyY2Uuc3RhcnRMaW5lTnVtYmVyICsgMTsgLy8gMC1iYXNlZCBcdTIxOTIgMS1iYXNlZFxuXHRcdFx0XHRcdFx0XHRjb25zdCBrZXkgPSBgJHtmaWxlTWF0Y2gucmVzb3VyY2UudG9TdHJpbmcoKX06JHtsaW5lTnVtYmVyfWA7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGlkeCA9IGxvb2t1cC5nZXQoa2V5KTtcblx0XHRcdFx0XHRcdFx0aWYgKGlkeCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cHJldmlld3NbaWR4XSA9IHRleHRNYXRjaC5wcmV2aWV3VGV4dC50cmltKCk7XG5cdFx0XHRcdFx0XHRcdFx0bG9va3VwLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBzZWFyY2ggbWlnaHQgZmFpbCwgbGVhdmUgcmVtYWluaW5nIHByZXZpZXdzIGFzIHVuZGVmaW5lZFxuXHRcdH1cblxuXHRcdHJldHVybiBwcmV2aWV3cztcblx0fVxuXG5cdHByaXZhdGUgX2NsYXNzaWZ5UmVmZXJlbmNlKHJlZjogTG9jYXRpb25MaW5rLCBkZWZpbml0aW9uczogTG9jYXRpb25MaW5rW10sIGltcGxlbWVudGF0aW9uczogTG9jYXRpb25MaW5rW10pOiBzdHJpbmcge1xuXHRcdGlmIChkZWZpbml0aW9ucy5zb21lKGQgPT4gdGhpcy5fb3ZlcmxhcHMocmVmLCBkKSkpIHtcblx0XHRcdHJldHVybiAnZGVmaW5pdGlvbic7XG5cdFx0fVxuXHRcdGlmIChpbXBsZW1lbnRhdGlvbnMuc29tZShkID0+IHRoaXMuX292ZXJsYXBzKHJlZiwgZCkpKSB7XG5cdFx0XHRyZXR1cm4gJ2ltcGxlbWVudGF0aW9uJztcblx0XHR9XG5cdFx0cmV0dXJuICdyZWZlcmVuY2UnO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3ZlcmxhcHMoYTogTG9jYXRpb25MaW5rLCBiOiBMb2NhdGlvbkxpbmspOiBib29sZWFuIHtcblx0XHRpZiAoIWlzRXF1YWwoYS51cmksIGIudXJpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyhhLnJhbmdlLCBiLnJhbmdlKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBVc2FnZXNUb29sQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0LnVzYWdlc1Rvb2wnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB0b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHVzYWdlc1Rvb2wgPSB0aGlzLl9zdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNhZ2VzVG9vbCkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sKHVzYWdlc1Rvb2wuZ2V0VG9vbERhdGEoKSwgdXNhZ2VzVG9vbCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQVMsb0JBQW9CO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUV0QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEw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
