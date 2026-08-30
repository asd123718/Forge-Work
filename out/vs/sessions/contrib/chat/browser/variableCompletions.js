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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isPatternInWord } from "../../../../base/common/filters.js";
import { Schemas } from "../../../../base/common/network.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { basename, isEqualOrParent } from "../../../../base/common/resources.js";
import { Range } from "../../../../editor/common/core/range.js";
import { getWordAtText } from "../../../../editor/common/core/wordHelper.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ISearchService } from "../../../../workbench/services/search/common/search.js";
import { searchFilesAndFolders } from "../../../../workbench/contrib/search/browser/searchChatContext.js";
import { IHistoryService } from "../../../../workbench/services/history/common/history.js";
import { isDiffEditorInput } from "../../../../workbench/common/editor.js";
import { isSupportedChatFileScheme } from "../../../../workbench/contrib/chat/common/constants.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
const VARIABLE_LEADER = "#";
const ADD_REFERENCE_COMMAND = "sessions.chat.addVariableReference";
CommandsRegistry.registerCommand(ADD_REFERENCE_COMMAND, (_accessor, arg) => {
  arg.attachments.addAttachments({
    id: arg.entry.id,
    name: arg.entry.name,
    value: arg.entry.value,
    kind: arg.entry.kind
  });
});
function computeRange(model, position, reg) {
  const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
  if (!varWord && model.getWordUntilPosition(position).word) {
    return;
  }
  if (!varWord && position.column > 1) {
    const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
    if (textBefore !== " ") {
      return;
    }
  }
  if (varWord) {
    const wordBefore = model.getWordUntilPosition({ lineNumber: position.lineNumber, column: varWord.startColumn });
    if (wordBefore.word) {
      return;
    }
  }
  let insert;
  let replace;
  if (!varWord) {
    insert = replace = Range.fromPositions(position);
  } else {
    insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
    replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
  }
  return { insert, replace, varWord };
}
let VariableCompletionHandler = class extends Disposable {
  constructor(_editor, _contextAttachments, _getWorkspaceUri, languageFeaturesService, searchService, labelService, configurationService, fileService, historyService, instantiationService) {
    super();
    this._editor = _editor;
    this._contextAttachments = _contextAttachments;
    this._getWorkspaceUri = _getWorkspaceUri;
    this.languageFeaturesService = languageFeaturesService;
    this.searchService = searchService;
    this.labelService = labelService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.historyService = historyService;
    this.instantiationService = instantiationService;
    this._decorations = this._editor.createDecorationsCollection();
    this._registerFileCompletions();
    this._registerDecorations();
  }
  // --- File & Folder completions ---
  _registerFileCompletions() {
    const uri = this._editor.getModel()?.uri;
    if (!uri) {
      return;
    }
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
      _debugDisplayName: "sessionsVariableFileAndFolder",
      triggerCharacters: [VARIABLE_LEADER],
      provideCompletionItems: async (model, position, _context, token) => {
        if (/^\s*\/troubleshoot\b/.test(model.getValue())) {
          return null;
        }
        const workspaceUri = this._getWorkspaceUri();
        if (!workspaceUri) {
          return null;
        }
        const range = computeRange(model, position, VariableCompletionHandler._wordPattern);
        if (!range) {
          return null;
        }
        const result = { suggestions: [], incomplete: true };
        await this._addFileAndFolderEntries(workspaceUri, result, range, token);
        return result;
      }
    }));
  }
  async _addFileAndFolderEntries(workspaceUri, result, info, token) {
    const makeItem = (resource, kind, description, boostPriority) => {
      const nameLabel = this.labelService.getUriBasenameLabel(resource);
      const text = `${VARIABLE_LEADER}file:${nameLabel}`;
      const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
      const labelDescription = description ? localize("fileEntryDescription", "{0} ({1})", uriLabel, description) : uriLabel;
      const sortText = boostPriority ? " " : "!";
      return {
        label: { label: nameLabel, description: labelDescription },
        filterText: `${nameLabel} ${VARIABLE_LEADER}${nameLabel} ${uriLabel}`,
        insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
        range: info,
        kind: kind === FileKind.FILE ? CompletionItemKind.File : CompletionItemKind.Folder,
        sortText,
        command: {
          id: ADD_REFERENCE_COMMAND,
          title: "",
          arguments: [{
            attachments: this._contextAttachments,
            entry: {
              id: resource.toString(),
              name: nameLabel,
              value: resource,
              kind: kind === FileKind.FILE ? "file" : "directory"
            }
          }]
        }
      };
    };
    let pattern;
    if (info.varWord?.word && info.varWord.word.startsWith(VARIABLE_LEADER)) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const seen = new ResourceSet();
    let historyCount = 0;
    for (const [i, item] of this.historyService.getHistory().entries()) {
      const resource = isDiffEditorInput(item) ? item.modified.resource : item.resource;
      if (!resource || seen.has(resource) || !this.instantiationService.invokeFunction((accessor) => isSupportedChatFileScheme(accessor, resource.scheme))) {
        continue;
      }
      if (!isEqualOrParent(resource, workspaceUri)) {
        continue;
      }
      if (pattern) {
        const uriLabel = this.labelService.getUriLabel(resource, { relative: true }).toLowerCase();
        const baseName = this.labelService.getUriBasenameLabel(resource).toLowerCase();
        const combined = `${baseName} ${uriLabel}`;
        if (!isPatternInWord(pattern, 0, pattern.length, combined, 0, combined.length)) {
          continue;
        }
      }
      seen.add(resource);
      result.suggestions.push(makeItem(resource, FileKind.FILE, i === 0 ? localize("activeFile", "Active file") : void 0, i === 0));
      if (++historyCount >= 5) {
        break;
      }
    }
    if (workspaceUri.scheme === Schemas.file || workspaceUri.scheme === Schemas.vscodeRemote) {
      await this._addEntriesViaSearch(workspaceUri, pattern, seen, makeItem, result, token);
    } else {
      await this._addEntriesViaFileService(workspaceUri, pattern, seen, makeItem, result, token);
    }
  }
  /**
   * Uses the search service to find files/folders — works for `file://` and `vscodeRemote` schemes.
   */
  async _addEntriesViaSearch(workspaceUri, pattern, seen, makeItem, result, token) {
    try {
      const { files, folders } = await searchFilesAndFolders(workspaceUri, pattern || "", true, token, void 0, this.configurationService, this.searchService);
      for (const file of files) {
        if (!seen.has(file)) {
          seen.add(file);
          result.suggestions.push(makeItem(file, FileKind.FILE));
        }
      }
      for (const folder of folders) {
        if (!seen.has(folder)) {
          seen.add(folder);
          result.suggestions.push(makeItem(folder, FileKind.FOLDER));
        }
      }
    } catch {
    }
  }
  /**
   * Walks the file tree via IFileService — used for virtual filesystems
   * (e.g. `github-remote-file://`) that don't support the search service.
   */
  async _addEntriesViaFileService(workspaceUri, pattern, seen, makeItem, result, token) {
    const maxResults = 100;
    const maxDepth = 10;
    const patternLower = pattern?.toLowerCase();
    const collect = async (uri, depth) => {
      if (result.suggestions.length >= maxResults || depth > maxDepth || token.isCancellationRequested) {
        return;
      }
      try {
        const stat = await this.fileService.resolve(uri);
        if (!stat.children) {
          return;
        }
        for (const child of stat.children) {
          if (result.suggestions.length >= maxResults || token.isCancellationRequested) {
            break;
          }
          if (child.isDirectory) {
            if (!seen.has(child.resource)) {
              const folderName = basename(child.resource).toLowerCase();
              if (!patternLower || folderName.includes(patternLower)) {
                seen.add(child.resource);
                result.suggestions.push(makeItem(child.resource, FileKind.FOLDER));
              }
            }
            await collect(child.resource, depth + 1);
          } else {
            if (!seen.has(child.resource)) {
              const fileName = child.name.toLowerCase();
              if (!patternLower || fileName.includes(patternLower)) {
                seen.add(child.resource);
                result.suggestions.push(makeItem(child.resource, FileKind.FILE));
              }
            }
          }
        }
      } catch {
      }
    };
    await collect(workspaceUri, 0);
  }
  // --- Decorations ---
  _registerDecorations() {
    this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
    this._updateDecorations();
  }
  _updateDecorations() {
    const model = this._editor.getModel();
    const value = model?.getValue() ?? "";
    const decos = [];
    const regex = /#file:\S+/g;
    let match;
    while ((match = regex.exec(value)) !== null) {
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      const startPos = model.getPositionAt(startOffset);
      const endPos = model.getPositionAt(endOffset);
      decos.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column
        },
        options: { description: "sessions-variable-reference", inlineClassName: VariableCompletionHandler._className }
      });
    }
    this._decorations.set(decos);
  }
};
VariableCompletionHandler._wordPattern = /#[^\s]*/g;
// MUST use g-flag
VariableCompletionHandler._className = "sessions-variable-reference";
VariableCompletionHandler = __decorateClass([
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, ISearchService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IHistoryService),
  __decorateParam(9, IInstantiationService)
], VariableCompletionHandler);
export {
  VariableCompletionHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcdmFyaWFibGVDb21wbGV0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNQYXR0ZXJuSW5Xb3JkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJV29yZEF0UG9zaXRpb24sIGdldFdvcmRBdFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkxpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBJTW9kZWxEZWx0YURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IHNlYXJjaEZpbGVzQW5kRm9sZGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaENoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBpc0RpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGlzU3VwcG9ydGVkQ2hhdEZpbGVTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0Q29udGV4dEF0dGFjaG1lbnRzIH0gZnJvbSAnLi9uZXdDaGF0Q29udGV4dEF0dGFjaG1lbnRzLmpzJztcblxuY29uc3QgVkFSSUFCTEVfTEVBREVSID0gJyMnO1xuXG4vKipcbiAqIENvbW1hbmQgSUQgdXNlZCBieSBjb21wbGV0aW9uIGl0ZW1zIHRvIGF0dGFjaCBhIGZpbGUvZm9sZGVyIHJlZmVyZW5jZVxuICogdG8gdGhlIHNlc3Npb25zIGNvbnRleHQgYXR0YWNobWVudHMuXG4gKi9cbmNvbnN0IEFERF9SRUZFUkVOQ0VfQ09NTUFORCA9ICdzZXNzaW9ucy5jaGF0LmFkZFZhcmlhYmxlUmVmZXJlbmNlJztcblxuaW50ZXJmYWNlIElSZWZlcmVuY2VBcmcge1xuXHRyZWFkb25seSBhdHRhY2htZW50czogTmV3Q2hhdENvbnRleHRBdHRhY2htZW50cztcblx0cmVhZG9ubHkgZW50cnk6IHtcblx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSB2YWx1ZTogVVJJO1xuXHRcdHJlYWRvbmx5IGtpbmQ6ICdmaWxlJyB8ICdkaXJlY3RvcnknO1xuXHR9O1xufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChBRERfUkVGRVJFTkNFX0NPTU1BTkQsIChfYWNjZXNzb3IsIGFyZzogSVJlZmVyZW5jZUFyZykgPT4ge1xuXHRhcmcuYXR0YWNobWVudHMuYWRkQXR0YWNobWVudHMoe1xuXHRcdGlkOiBhcmcuZW50cnkuaWQsXG5cdFx0bmFtZTogYXJnLmVudHJ5Lm5hbWUsXG5cdFx0dmFsdWU6IGFyZy5lbnRyeS52YWx1ZSxcblx0XHRraW5kOiBhcmcuZW50cnkua2luZCxcblx0fSk7XG59KTtcblxuaW50ZXJmYWNlIElDb21wbGV0aW9uUmFuZ2VSZXN1bHQge1xuXHRpbnNlcnQ6IFJhbmdlO1xuXHRyZXBsYWNlOiBSYW5nZTtcblx0dmFyV29yZDogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbDtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZVJhbmdlKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHJlZzogUmVnRXhwKTogSUNvbXBsZXRpb25SYW5nZVJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHZhcldvcmQgPSBnZXRXb3JkQXRUZXh0KHBvc2l0aW9uLmNvbHVtbiwgcmVnLCBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSwgMCk7XG5cdGlmICghdmFyV29yZCAmJiBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3NpdGlvbikud29yZCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmICghdmFyV29yZCAmJiBwb3NpdGlvbi5jb2x1bW4gPiAxKSB7XG5cdFx0Y29uc3QgdGV4dEJlZm9yZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uIC0gMSwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSk7XG5cdFx0aWYgKHRleHRCZWZvcmUgIT09ICcgJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdC8vIFJlamVjdCBpZiB0aGVyZSdzIGEgbm9ybWFsIHdvcmQgcmlnaHQgYmVmb3JlIG91ciB2YXJpYWJsZSB3b3JkXG5cdGlmICh2YXJXb3JkKSB7XG5cdFx0Y29uc3Qgd29yZEJlZm9yZSA9IG1vZGVsLmdldFdvcmRVbnRpbFBvc2l0aW9uKHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgY29sdW1uOiB2YXJXb3JkLnN0YXJ0Q29sdW1uIH0pO1xuXHRcdGlmICh3b3JkQmVmb3JlLndvcmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRsZXQgaW5zZXJ0OiBSYW5nZTtcblx0bGV0IHJlcGxhY2U6IFJhbmdlO1xuXHRpZiAoIXZhcldvcmQpIHtcblx0XHRpbnNlcnQgPSByZXBsYWNlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbik7XG5cdH0gZWxzZSB7XG5cdFx0aW5zZXJ0ID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0cmVwbGFjZSA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCB2YXJXb3JkLnN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCB2YXJXb3JkLmVuZENvbHVtbik7XG5cdH1cblxuXHRyZXR1cm4geyBpbnNlcnQsIHJlcGxhY2UsIHZhcldvcmQgfTtcbn1cblxuLyoqXG4gKiBQcm92aWRlcyBgI2ZpbGU6YCBjb21wbGV0aW9ucyBmb3IgZmlsZXMgYW5kIGZvbGRlcnMgaW4gdGhlIHNlc3Npb25zIG5ldy1jaGF0IGlucHV0LFxuICogZm9sbG93aW5nIHRoZSBzYW1lIHBhdHRlcm4gYXMge0BsaW5rIFNsYXNoQ29tbWFuZEhhbmRsZXJ9LlxuICpcbiAqIENvbXBsZXRpb25zIGFyZSBzY29wZWQgdG8gdGhlIHdvcmtzcGFjZSBzZWxlY3RlZCBpbiB0aGUgd29ya3NwYWNlIHBpY2tlciBkcm9wZG93bixcbiAqIG1hdGNoaW5nIHRoZSBiZWhhdmlvdXIgb2YgdGhlIFwiQWRkIENvbnRleHQuLi5cIiBhdHRhY2ggYnV0dG9uLlxuICogRm9yIGxvY2FsL3JlbW90ZSB3b3Jrc3BhY2VzIHRoZSBzZWFyY2ggc2VydmljZSBpcyB1c2VkOyBmb3IgdmlydHVhbCBmaWxlc3lzdGVtc1xuICogKGUuZy4gYGdpdGh1Yi1yZW1vdGUtZmlsZTovL2ApIHRoZSBmaWxlIHNlcnZpY2UgdHJlZSBpcyB3YWxrZWQgZGlyZWN0bHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBWYXJpYWJsZUNvbXBsZXRpb25IYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3dvcmRQYXR0ZXJuID0gLyNbXlxcc10qL2c7IC8vIE1VU1QgdXNlIGctZmxhZ1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfY2xhc3NOYW1lID0gJ3Nlc3Npb25zLXZhcmlhYmxlLXJlZmVyZW5jZSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRBdHRhY2htZW50czogTmV3Q2hhdENvbnRleHRBdHRhY2htZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRXb3Jrc3BhY2VVcmk6ICgpID0+IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLl9yZWdpc3RlckZpbGVDb21wbGV0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdC8vIC0tLSBGaWxlICYgRm9sZGVyIGNvbXBsZXRpb25zIC0tLVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRmlsZUNvbXBsZXRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogdXJpLnNjaGVtZSwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdzZXNzaW9uc1ZhcmlhYmxlRmlsZUFuZEZvbGRlcicsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW1ZBUklBQkxFX0xFQURFUl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Ly8gRm9yIGEgYC90cm91Ymxlc2hvb3RgIHJlcXVlc3QsIGAjYCByZWZlcmVuY2VzIHRhcmdldCBzZXNzaW9uc1xuXHRcdFx0XHQvLyAoaGFuZGxlZCBieSB0aGUgYCNzZXNzaW9uYCBwcm92aWRlcik7IHN1cHByZXNzIGZpbGUvZm9sZGVyXG5cdFx0XHRcdC8vIGNvbXBsZXRpb25zIHNvIG9ubHkgc2Vzc2lvbnMgYXJlIG9mZmVyZWQuXG5cdFx0XHRcdGlmICgvXlxccypcXC90cm91Ymxlc2hvb3RcXGIvLnRlc3QobW9kZWwuZ2V0VmFsdWUoKSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IHRoaXMuX2dldFdvcmtzcGFjZVVyaSgpO1xuXHRcdFx0XHRpZiAoIXdvcmtzcGFjZVVyaSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlUmFuZ2UobW9kZWwsIHBvc2l0aW9uLCBWYXJpYWJsZUNvbXBsZXRpb25IYW5kbGVyLl93b3JkUGF0dGVybik7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogQ29tcGxldGlvbkxpc3QgPSB7IHN1Z2dlc3Rpb25zOiBbXSwgaW5jb21wbGV0ZTogdHJ1ZSB9O1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hZGRGaWxlQW5kRm9sZGVyRW50cmllcyh3b3Jrc3BhY2VVcmksIHJlc3VsdCwgcmFuZ2UsIHRva2VuKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hZGRGaWxlQW5kRm9sZGVyRW50cmllcyh3b3Jrc3BhY2VVcmk6IFVSSSwgcmVzdWx0OiBDb21wbGV0aW9uTGlzdCwgaW5mbzogSUNvbXBsZXRpb25SYW5nZVJlc3VsdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWFrZUl0ZW0gPSAocmVzb3VyY2U6IFVSSSwga2luZDogRmlsZUtpbmQsIGRlc2NyaXB0aW9uPzogc3RyaW5nLCBib29zdFByaW9yaXR5PzogYm9vbGVhbik6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdGNvbnN0IG5hbWVMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwocmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGAke1ZBUklBQkxFX0xFQURFUn1maWxlOiR7bmFtZUxhYmVsfWA7XG5cdFx0XHRjb25zdCB1cmlMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgbGFiZWxEZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2ZpbGVFbnRyeURlc2NyaXB0aW9uJywgJ3swfSAoezF9KScsIHVyaUxhYmVsLCBkZXNjcmlwdGlvbilcblx0XHRcdFx0OiB1cmlMYWJlbDtcblx0XHRcdGNvbnN0IHNvcnRUZXh0ID0gYm9vc3RQcmlvcml0eSA/ICcgJyA6ICchJztcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IG5hbWVMYWJlbCwgZGVzY3JpcHRpb246IGxhYmVsRGVzY3JpcHRpb24gfSxcblx0XHRcdFx0ZmlsdGVyVGV4dDogYCR7bmFtZUxhYmVsfSAke1ZBUklBQkxFX0xFQURFUn0ke25hbWVMYWJlbH0gJHt1cmlMYWJlbH1gLFxuXHRcdFx0XHRpbnNlcnRUZXh0OiBpbmZvLnZhcldvcmQ/LmVuZENvbHVtbiA9PT0gaW5mby5yZXBsYWNlLmVuZENvbHVtbiA/IGAke3RleHR9IGAgOiB0ZXh0LFxuXHRcdFx0XHRyYW5nZTogaW5mbyxcblx0XHRcdFx0a2luZDoga2luZCA9PT0gRmlsZUtpbmQuRklMRSA/IENvbXBsZXRpb25JdGVtS2luZC5GaWxlIDogQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdFx0c29ydFRleHQsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogQUREX1JFRkVSRU5DRV9DT01NQU5ELFxuXHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHRhdHRhY2htZW50czogdGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLFxuXHRcdFx0XHRcdFx0ZW50cnk6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdG5hbWU6IG5hbWVMYWJlbCxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBraW5kID09PSBGaWxlS2luZC5GSUxFID8gJ2ZpbGUnIDogJ2RpcmVjdG9yeScsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElSZWZlcmVuY2VBcmddLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRsZXQgcGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpbmZvLnZhcldvcmQ/LndvcmQgJiYgaW5mby52YXJXb3JkLndvcmQuc3RhcnRzV2l0aChWQVJJQUJMRV9MRUFERVIpKSB7XG5cdFx0XHRwYXR0ZXJuID0gaW5mby52YXJXb3JkLndvcmQudG9Mb3dlckNhc2UoKS5zbGljZSgxKTsgLy8gcmVtb3ZlIGxlYWRpbmcgI1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRcdC8vIEhJU1RPUlkgXHUyMDE0IGFsd2F5cyBzaG93IHJlY2VudCBmaWxlcyBmcm9tIGVkaXRvciBoaXN0b3J5IHRoYXQgYXJlIHdpdGhpbiB0aGUgd29ya3NwYWNlXG5cdFx0bGV0IGhpc3RvcnlDb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBbaSwgaXRlbV0gb2YgdGhpcy5oaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KCkuZW50cmllcygpKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzRGlmZkVkaXRvcklucHV0KGl0ZW0pID8gaXRlbS5tb2RpZmllZC5yZXNvdXJjZSA6IGl0ZW0ucmVzb3VyY2U7XG5cdFx0XHRpZiAoIXJlc291cmNlIHx8IHNlZW4uaGFzKHJlc291cmNlKSB8fCAhdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lKGFjY2Vzc29yLCByZXNvdXJjZS5zY2hlbWUpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBpbmNsdWRlIGZpbGVzIHdpdGhpbiB0aGUgc2VsZWN0ZWQgd29ya3NwYWNlXG5cdFx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgd29ya3NwYWNlVXJpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhdHRlcm4pIHtcblx0XHRcdFx0Y29uc3QgdXJpTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBiYXNlTmFtZSA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwocmVzb3VyY2UpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IGNvbWJpbmVkID0gYCR7YmFzZU5hbWV9ICR7dXJpTGFiZWx9YDtcblx0XHRcdFx0aWYgKCFpc1BhdHRlcm5JbldvcmQocGF0dGVybiwgMCwgcGF0dGVybi5sZW5ndGgsIGNvbWJpbmVkLCAwLCBjb21iaW5lZC5sZW5ndGgpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0c2Vlbi5hZGQocmVzb3VyY2UpO1xuXHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2gobWFrZUl0ZW0ocmVzb3VyY2UsIEZpbGVLaW5kLkZJTEUsIGkgPT09IDAgPyBsb2NhbGl6ZSgnYWN0aXZlRmlsZScsICdBY3RpdmUgZmlsZScpIDogdW5kZWZpbmVkLCBpID09PSAwKSk7XG5cdFx0XHRpZiAoKytoaXN0b3J5Q291bnQgPj0gNSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTRUFSQ0ggXHUyMDE0IGFsd2F5cyBydW4gdG8gcG9wdWxhdGUgaW5pdGlhbCByZXN1bHRzIChlbXB0eSBwYXR0ZXJuIHJldHVybnMgc2NvcmVkIGZpbGVzKVxuXHRcdGlmICh3b3Jrc3BhY2VVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHwgd29ya3NwYWNlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2FkZEVudHJpZXNWaWFTZWFyY2god29ya3NwYWNlVXJpLCBwYXR0ZXJuLCBzZWVuLCBtYWtlSXRlbSwgcmVzdWx0LCB0b2tlbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX2FkZEVudHJpZXNWaWFGaWxlU2VydmljZSh3b3Jrc3BhY2VVcmksIHBhdHRlcm4sIHNlZW4sIG1ha2VJdGVtLCByZXN1bHQsIHRva2VuKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXNlcyB0aGUgc2VhcmNoIHNlcnZpY2UgdG8gZmluZCBmaWxlcy9mb2xkZXJzIFx1MjAxNCB3b3JrcyBmb3IgYGZpbGU6Ly9gIGFuZCBgdnNjb2RlUmVtb3RlYCBzY2hlbWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYWRkRW50cmllc1ZpYVNlYXJjaChcblx0XHR3b3Jrc3BhY2VVcmk6IFVSSSxcblx0XHRwYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0c2VlbjogUmVzb3VyY2VTZXQsXG5cdFx0bWFrZUl0ZW06IChyZXNvdXJjZTogVVJJLCBraW5kOiBGaWxlS2luZCwgZGVzY3JpcHRpb24/OiBzdHJpbmcsIGJvb3N0UHJpb3JpdHk/OiBib29sZWFuKSA9PiBDb21wbGV0aW9uSXRlbSxcblx0XHRyZXN1bHQ6IENvbXBsZXRpb25MaXN0LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgZmlsZXMsIGZvbGRlcnMgfSA9IGF3YWl0IHNlYXJjaEZpbGVzQW5kRm9sZGVycyh3b3Jrc3BhY2VVcmksIHBhdHRlcm4gfHwgJycsIHRydWUsIHRva2VuLCB1bmRlZmluZWQsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuc2VhcmNoU2VydmljZSk7XG5cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRpZiAoIXNlZW4uaGFzKGZpbGUpKSB7XG5cdFx0XHRcdFx0c2Vlbi5hZGQoZmlsZSk7XG5cdFx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2gobWFrZUl0ZW0oZmlsZSwgRmlsZUtpbmQuRklMRSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHRcdGlmICghc2Vlbi5oYXMoZm9sZGVyKSkge1xuXHRcdFx0XHRcdHNlZW4uYWRkKGZvbGRlcik7XG5cdFx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2gobWFrZUl0ZW0oZm9sZGVyLCBGaWxlS2luZC5GT0xERVIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gc2VhcmNoIG1heSBmYWlsIG9yIGJlIGNhbmNlbGxlZFxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXYWxrcyB0aGUgZmlsZSB0cmVlIHZpYSBJRmlsZVNlcnZpY2UgXHUyMDE0IHVzZWQgZm9yIHZpcnR1YWwgZmlsZXN5c3RlbXNcblx0ICogKGUuZy4gYGdpdGh1Yi1yZW1vdGUtZmlsZTovL2ApIHRoYXQgZG9uJ3Qgc3VwcG9ydCB0aGUgc2VhcmNoIHNlcnZpY2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hZGRFbnRyaWVzVmlhRmlsZVNlcnZpY2UoXG5cdFx0d29ya3NwYWNlVXJpOiBVUkksXG5cdFx0cGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHNlZW46IFJlc291cmNlU2V0LFxuXHRcdG1ha2VJdGVtOiAocmVzb3VyY2U6IFVSSSwga2luZDogRmlsZUtpbmQsIGRlc2NyaXB0aW9uPzogc3RyaW5nLCBib29zdFByaW9yaXR5PzogYm9vbGVhbikgPT4gQ29tcGxldGlvbkl0ZW0sXG5cdFx0cmVzdWx0OiBDb21wbGV0aW9uTGlzdCxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1heFJlc3VsdHMgPSAxMDA7XG5cdFx0Y29uc3QgbWF4RGVwdGggPSAxMDtcblx0XHRjb25zdCBwYXR0ZXJuTG93ZXIgPSBwYXR0ZXJuPy50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0Y29uc3QgY29sbGVjdCA9IGFzeW5jICh1cmk6IFVSSSwgZGVwdGg6IG51bWJlcik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0aWYgKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGggPj0gbWF4UmVzdWx0cyB8fCBkZXB0aCA+IG1heERlcHRoIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh1cmkpO1xuXHRcdFx0XHRpZiAoIXN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRpZiAocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCA+PSBtYXhSZXN1bHRzIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNoaWxkLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHQvLyBJbmNsdWRlIG1hdGNoaW5nIGZvbGRlcnMgYXMgY29tcGxldGlvbnNcblx0XHRcdFx0XHRcdGlmICghc2Vlbi5oYXMoY2hpbGQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZvbGRlck5hbWUgPSBiYXNlbmFtZShjaGlsZC5yZXNvdXJjZSkudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFwYXR0ZXJuTG93ZXIgfHwgZm9sZGVyTmFtZS5pbmNsdWRlcyhwYXR0ZXJuTG93ZXIpKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQoY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VJdGVtKGNoaWxkLnJlc291cmNlLCBGaWxlS2luZC5GT0xERVIpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YXdhaXQgY29sbGVjdChjaGlsZC5yZXNvdXJjZSwgZGVwdGggKyAxKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyhjaGlsZC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBjaGlsZC5uYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRcdGlmICghcGF0dGVybkxvd2VyIHx8IGZpbGVOYW1lLmluY2x1ZGVzKHBhdHRlcm5Mb3dlcikpIHtcblx0XHRcdFx0XHRcdFx0XHRzZWVuLmFkZChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2gobWFrZUl0ZW0oY2hpbGQucmVzb3VyY2UsIEZpbGVLaW5kLkZJTEUpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBlcnJvcnMgZm9yIGluZGl2aWR1YWwgZGlyZWN0b3JpZXNcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgY29sbGVjdCh3b3Jrc3BhY2VVcmksIDApO1xuXHR9XG5cblx0Ly8gLS0tIERlY29yYXRpb25zIC0tLVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCkpKTtcblx0XHR0aGlzLl91cGRhdGVEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCB2YWx1ZSA9IG1vZGVsPy5nZXRWYWx1ZSgpID8/ICcnO1xuXG5cdFx0Y29uc3QgZGVjb3M6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0Y29uc3QgcmVnZXggPSAvI2ZpbGU6XFxTKy9nO1xuXHRcdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuXHRcdHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKHZhbHVlKSkgIT09IG51bGwpIHtcblx0XHRcdC8vIENvbnZlcnQgc3RyaW5nIG9mZnNldCB0byBsaW5lL2NvbHVtbiBwb3NpdGlvblxuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSBtYXRjaC5pbmRleDtcblx0XHRcdGNvbnN0IGVuZE9mZnNldCA9IHN0YXJ0T2Zmc2V0ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuXHRcdFx0Y29uc3Qgc3RhcnRQb3MgPSBtb2RlbCEuZ2V0UG9zaXRpb25BdChzdGFydE9mZnNldCk7XG5cdFx0XHRjb25zdCBlbmRQb3MgPSBtb2RlbCEuZ2V0UG9zaXRpb25BdChlbmRPZmZzZXQpO1xuXG5cdFx0XHRkZWNvcy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0UG9zLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHN0YXJ0UG9zLmNvbHVtbixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBlbmRQb3MubGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IGVuZFBvcy5jb2x1bW4sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICdzZXNzaW9ucy12YXJpYWJsZS1yZWZlcmVuY2UnLCBpbmxpbmVDbGFzc05hbWU6IFZhcmlhYmxlQ29tcGxldGlvbkhhbmRsZXIuX2NsYXNzTmFtZSB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0KGRlY29zKTtcblx0fVxuXG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsVUFBVSx1QkFBdUI7QUFJMUMsU0FBUyxhQUFhO0FBQ3RCLFNBQTBCLHFCQUFxQjtBQUMvQyxTQUE0QywwQkFBMEM7QUFFdEYsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDZCQUE2QjtBQUd0QyxNQUFNLGtCQUFrQjtBQU14QixNQUFNLHdCQUF3QjtBQVk5QixpQkFBaUIsZ0JBQWdCLHVCQUF1QixDQUFDLFdBQVcsUUFBdUI7QUFDMUYsTUFBSSxZQUFZLGVBQWU7QUFBQSxJQUM5QixJQUFJLElBQUksTUFBTTtBQUFBLElBQ2QsTUFBTSxJQUFJLE1BQU07QUFBQSxJQUNoQixPQUFPLElBQUksTUFBTTtB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
