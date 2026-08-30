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
import { dirname, extUri } from "../../../../../../base/common/resources.js";
import { getPromptsTypeForLanguageId, PromptsType } from "../promptTypes.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { CompletionItemKind } from "../../../../../../editor/common/languages.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CharCode } from "../../../../../../base/common/charCode.js";
import { getWordAtText } from "../../../../../../editor/common/core/wordHelper.js";
import { chatVariableLeader } from "../../requestParser/chatParserTypes.js";
import { ILanguageModelToolsService } from "../../tools/languageModelToolsService.js";
let PromptBodyAutocompletion = class {
  constructor(fileService, languageModelToolsService) {
    this.fileService = fileService;
    this.languageModelToolsService = languageModelToolsService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptBodyAutocompletion";
    /**
     * List of trigger characters handled by this provider.
     */
    this.triggerCharacters = [":", ".", "/", "\\"];
  }
  /**
   * The main function of this provider that calculates
   * completion items based on the provided arguments.
   */
  async provideCompletionItems(model, position, context, token) {
    const promptsType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptsType) {
      return void 0;
    }
    const reference = await this.findVariableReference(model, position, token);
    if (!reference) {
      return void 0;
    }
    const suggestions = [];
    switch (reference.type) {
      case "file":
        if (reference.contentRange.containsPosition(position)) {
          await this.collectFilePathCompletions(model, position, reference.contentRange, suggestions);
        } else {
          await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
        }
        break;
      case "tool":
        if (reference.contentRange.containsPosition(position)) {
          if (promptsType === PromptsType.agent || promptsType === PromptsType.prompt) {
            await this.collectToolCompletions(model, position, reference.contentRange, suggestions);
          }
        } else {
          await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
        }
        break;
      default:
        await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
    }
    return { suggestions };
  }
  async collectToolCompletions(model, position, toolRange, suggestions) {
    for (const toolName of this.languageModelToolsService.getFullReferenceNames()) {
      suggestions.push({
        label: toolName,
        kind: CompletionItemKind.Value,
        filterText: toolName,
        insertText: toolName,
        range: toolRange
      });
    }
  }
  async collectFilePathCompletions(model, position, pathRange, suggestions) {
    const pathUntilPosition = model.getValueInRange(pathRange.setEndPosition(position.lineNumber, position.column));
    const pathSeparator = pathUntilPosition.includes("/") || !pathUntilPosition.includes("\\") ? "/" : "\\";
    let parentFolderPath;
    if (pathUntilPosition.match(/[^\/]\.\.$/i)) {
      parentFolderPath = pathUntilPosition + pathSeparator;
    } else {
      let i = pathUntilPosition.length - 1;
      while (i >= 0 && ![CharCode.Slash, CharCode.Backslash].includes(pathUntilPosition.charCodeAt(i))) {
        i--;
      }
      parentFolderPath = pathUntilPosition.substring(0, i + 1);
    }
    const retriggerCommand = { id: "editor.action.triggerSuggest", title: "Suggest" };
    try {
      const currentFolder = extUri.resolvePath(dirname(model.uri), parentFolderPath);
      const { children } = await this.fileService.resolve(currentFolder);
      if (children) {
        for (const child of children) {
          const insertText = (parentFolderPath || "." + pathSeparator) + child.name;
          suggestions.push({
            label: child.name + (child.isDirectory ? pathSeparator : ""),
            kind: child.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
            range: pathRange,
            insertText: insertText + (child.isDirectory ? pathSeparator : ""),
            filterText: insertText,
            command: child.isDirectory ? retriggerCommand : void 0
          });
        }
      }
    } catch (e) {
    }
    suggestions.push({
      label: "..",
      kind: CompletionItemKind.Folder,
      insertText: parentFolderPath + ".." + pathSeparator,
      range: pathRange,
      filterText: parentFolderPath + "..",
      command: retriggerCommand
    });
  }
  /**
   * Finds a file reference that suites the provided `position`.
   */
  async findVariableReference(model, position, token) {
    if (model.getLineContent(1).trimEnd() === "---") {
      let i = 2;
      while (i <= model.getLineCount() && model.getLineContent(i).trimEnd() !== "---") {
        i++;
      }
      if (i >= position.lineNumber) {
        return void 0;
      }
    }
    const reg = new RegExp(`${chatVariableLeader}[^\\s#]*`, "g");
    const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
    if (!varWord) {
      return void 0;
    }
    const range = new Range(position.lineNumber, varWord.startColumn + 1, position.lineNumber, varWord.endColumn);
    const nameMatch = varWord.word.match(/^#(\w+:)?/);
    if (nameMatch) {
      const contentCol = varWord.startColumn + nameMatch[0].length;
      if (nameMatch[1] === "file:") {
        return { type: "file", contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
      } else if (nameMatch[1] === "tool:") {
        return { type: "tool", contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
      }
    }
    return { type: "", contentRange: range, range };
  }
  async collectDefaultCompletions(model, range, promptFileType, suggestions) {
    const labels = promptFileType === PromptsType.instructions ? ["file"] : ["file", "tool"];
    labels.forEach((label) => {
      suggestions.push({
        label: `${label}:`,
        kind: CompletionItemKind.Keyword,
        insertText: `${label}:`,
        range,
        command: { id: "editor.action.triggerSuggest", title: "Suggest" }
      });
    });
  }
};
PromptBodyAutocompletion = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ILanguageModelToolsService)
], PromptBodyAutocompletion);
export {
  PromptBodyAutocompletion
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xccHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlybmFtZSwgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZCwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25MaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBnZXRXb3JkQXRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgY2hhdFZhcmlhYmxlTGVhZGVyIH0gZnJvbSAnLi4vLi4vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBQcm92aWRlcyBhdXRvY29tcGxldGlvbiBmb3IgdGhlIHZhcmlhYmxlcyBpbnNpZGUgcHJvbXB0IGJvZGllcy5cbiAqIC0gI2ZpbGU6IHBhdGhzIHRvIGZpbGVzIGFuZCBmb2xkZXJzIGluIHRoZSB3b3Jrc3BhY2VcbiAqIC0gIyB0b29sIG5hbWVzXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9tcHRCb2R5QXV0b2NvbXBsZXRpb24gaW1wbGVtZW50cyBDb21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0LyoqXG5cdCAqIERlYnVnIGRpc3BsYXkgbmFtZSBmb3IgdGhpcyBwcm92aWRlci5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBfZGVidWdEaXNwbGF5TmFtZTogc3RyaW5nID0gJ1Byb21wdEJvZHlBdXRvY29tcGxldGlvbic7XG5cblx0LyoqXG5cdCAqIExpc3Qgb2YgdHJpZ2dlciBjaGFyYWN0ZXJzIGhhbmRsZWQgYnkgdGhpcyBwcm92aWRlci5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSB0cmlnZ2VyQ2hhcmFjdGVycyA9IFsnOicsICcuJywgJy8nLCAnXFxcXCddO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWFpbiBmdW5jdGlvbiBvZiB0aGlzIHByb3ZpZGVyIHRoYXQgY2FsY3VsYXRlc1xuXHQgKiBjb21wbGV0aW9uIGl0ZW1zIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBhcmd1bWVudHMuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBjb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDb21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb21wdHNUeXBlID0gZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkKG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0aWYgKCFwcm9tcHRzVHlwZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gYXdhaXQgdGhpcy5maW5kVmFyaWFibGVSZWZlcmVuY2UobW9kZWwsIHBvc2l0aW9uLCB0b2tlbik7XG5cdFx0aWYgKCFyZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0c3dpdGNoIChyZWZlcmVuY2UudHlwZSkge1xuXHRcdFx0Y2FzZSAnZmlsZSc6XG5cdFx0XHRcdGlmIChyZWZlcmVuY2UuY29udGVudFJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0Ly8gaW5zaWRlIHRoZSBsaW5rIHJhbmdlXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb2xsZWN0RmlsZVBhdGhDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIHJlZmVyZW5jZS5jb250ZW50UmFuZ2UsIHN1Z2dlc3Rpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbGxlY3REZWZhdWx0Q29tcGxldGlvbnMobW9kZWwsIHJlZmVyZW5jZS5yYW5nZSwgcHJvbXB0c1R5cGUsIHN1Z2dlc3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Rvb2wnOlxuXHRcdFx0XHRpZiAocmVmZXJlbmNlLmNvbnRlbnRSYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdGlmIChwcm9tcHRzVHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQgfHwgcHJvbXB0c1R5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb2xsZWN0VG9vbENvbXBsZXRpb25zKG1vZGVsLCBwb3NpdGlvbiwgcmVmZXJlbmNlLmNvbnRlbnRSYW5nZSwgc3VnZ2VzdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbGxlY3REZWZhdWx0Q29tcGxldGlvbnMobW9kZWwsIHJlZmVyZW5jZS5yYW5nZSwgcHJvbXB0c1R5cGUsIHN1Z2dlc3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29sbGVjdERlZmF1bHRDb21wbGV0aW9ucyhtb2RlbCwgcmVmZXJlbmNlLnJhbmdlLCBwcm9tcHRzVHlwZSwgc3VnZ2VzdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzdWdnZXN0aW9ucyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb2xsZWN0VG9vbENvbXBsZXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRvb2xSYW5nZTogUmFuZ2UsIHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCB0b29sTmFtZSBvZiB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWVzKCkpIHtcblx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogdG9vbE5hbWUsXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5WYWx1ZSxcblx0XHRcdFx0ZmlsdGVyVGV4dDogdG9vbE5hbWUsXG5cdFx0XHRcdGluc2VydFRleHQ6IHRvb2xOYW1lLFxuXHRcdFx0XHRyYW5nZTogdG9vbFJhbmdlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIGNvbGxlY3RGaWxlUGF0aENvbXBsZXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHBhdGhSYW5nZTogUmFuZ2UsIHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGF0aFVudGlsUG9zaXRpb24gPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocGF0aFJhbmdlLnNldEVuZFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikpO1xuXHRcdGNvbnN0IHBhdGhTZXBhcmF0b3IgPSBwYXRoVW50aWxQb3NpdGlvbi5pbmNsdWRlcygnLycpIHx8ICFwYXRoVW50aWxQb3NpdGlvbi5pbmNsdWRlcygnXFxcXCcpID8gJy8nIDogJ1xcXFwnO1xuXHRcdGxldCBwYXJlbnRGb2xkZXJQYXRoOiBzdHJpbmc7XG5cdFx0aWYgKHBhdGhVbnRpbFBvc2l0aW9uLm1hdGNoKC9bXlxcL11cXC5cXC4kL2kpKSB7IC8vIGVuZHMgd2l0aCBgLi5gXG5cdFx0XHRwYXJlbnRGb2xkZXJQYXRoID0gcGF0aFVudGlsUG9zaXRpb24gKyBwYXRoU2VwYXJhdG9yO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgaSA9IHBhdGhVbnRpbFBvc2l0aW9uLmxlbmd0aCAtIDE7XG5cdFx0XHR3aGlsZSAoaSA+PSAwICYmICFbQ2hhckNvZGUuU2xhc2gsIENoYXJDb2RlLkJhY2tzbGFzaF0uaW5jbHVkZXMocGF0aFVudGlsUG9zaXRpb24uY2hhckNvZGVBdChpKSkpIHtcblx0XHRcdFx0aS0tO1xuXHRcdFx0fVxuXHRcdFx0cGFyZW50Rm9sZGVyUGF0aCA9IHBhdGhVbnRpbFBvc2l0aW9uLnN1YnN0cmluZygwLCBpICsgMSk7IC8vIHRoZSBzZWdtZW50IHVwIHRvIHRoZSBgL2Agb3IgYFxcYCBiZWZvcmUgdGhlIHBvc2l0aW9uXG5cdFx0fVxuXG5cdFx0Y29uc3QgcmV0cmlnZ2VyQ29tbWFuZCA9IHsgaWQ6ICdlZGl0b3IuYWN0aW9uLnRyaWdnZXJTdWdnZXN0JywgdGl0bGU6ICdTdWdnZXN0JyB9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRGb2xkZXIgPSBleHRVcmkucmVzb2x2ZVBhdGgoZGlybmFtZShtb2RlbC51cmkpLCBwYXJlbnRGb2xkZXJQYXRoKTtcblx0XHRcdGNvbnN0IHsgY2hpbGRyZW4gfSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShjdXJyZW50Rm9sZGVyKTtcblx0XHRcdGlmIChjaGlsZHJlbikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zZXJ0VGV4dCA9IChwYXJlbnRGb2xkZXJQYXRoIHx8ICgnLicgKyBwYXRoU2VwYXJhdG9yKSkgKyBjaGlsZC5uYW1lO1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGNoaWxkLm5hbWUgKyAoY2hpbGQuaXNEaXJlY3RvcnkgPyBwYXRoU2VwYXJhdG9yIDogJycpLFxuXHRcdFx0XHRcdFx0a2luZDogY2hpbGQuaXNEaXJlY3RvcnkgPyBDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyIDogQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsXG5cdFx0XHRcdFx0XHRyYW5nZTogcGF0aFJhbmdlLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogaW5zZXJ0VGV4dCArIChjaGlsZC5pc0RpcmVjdG9yeSA/IHBhdGhTZXBhcmF0b3IgOiAnJyksXG5cdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBpbnNlcnRUZXh0LFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogY2hpbGQuaXNEaXJlY3RvcnkgPyByZXRyaWdnZXJDb21tYW5kIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBpZ25vcmUgZXJyb3JzIGFjY2Vzc2luZyB0aGUgZm9sZGVyIGxvY2F0aW9uXG5cdFx0fVxuXG5cdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRsYWJlbDogJy4uJyxcblx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsXG5cdFx0XHRpbnNlcnRUZXh0OiBwYXJlbnRGb2xkZXJQYXRoICsgJy4uJyArIHBhdGhTZXBhcmF0b3IsXG5cdFx0XHRyYW5nZTogcGF0aFJhbmdlLFxuXHRcdFx0ZmlsdGVyVGV4dDogcGFyZW50Rm9sZGVyUGF0aCArICcuLicsXG5cdFx0XHRjb21tYW5kOiByZXRyaWdnZXJDb21tYW5kXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogRmluZHMgYSBmaWxlIHJlZmVyZW5jZSB0aGF0IHN1aXRlcyB0aGUgcHJvdmlkZWQgYHBvc2l0aW9uYC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZmluZFZhcmlhYmxlUmVmZXJlbmNlKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBjb250ZW50UmFuZ2U6IFJhbmdlOyB0eXBlOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKG1vZGVsLmdldExpbmVDb250ZW50KDEpLnRyaW1FbmQoKSA9PT0gJy0tLScpIHtcblx0XHRcdGxldCBpID0gMjtcblx0XHRcdHdoaWxlIChpIDw9IG1vZGVsLmdldExpbmVDb3VudCgpICYmIG1vZGVsLmdldExpbmVDb250ZW50KGkpLnRyaW1FbmQoKSAhPT0gJy0tLScpIHtcblx0XHRcdFx0aSsrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGkgPj0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBpbnNpZGUgZnJvbnQgbWF0dGVyXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnID0gbmV3IFJlZ0V4cChgJHtjaGF0VmFyaWFibGVMZWFkZXJ9W15cXFxccyNdKmAsICdnJyk7XG5cdFx0Y29uc3QgdmFyV29yZCA9IGdldFdvcmRBdFRleHQocG9zaXRpb24uY29sdW1uLCByZWcsIG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLCAwKTtcblx0XHRpZiAoIXZhcldvcmQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuc3RhcnRDb2x1bW4gKyAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCB2YXJXb3JkLmVuZENvbHVtbik7XG5cdFx0Y29uc3QgbmFtZU1hdGNoID0gdmFyV29yZC53b3JkLm1hdGNoKC9eIyhcXHcrOik/Lyk7XG5cdFx0aWYgKG5hbWVNYXRjaCkge1xuXHRcdFx0Y29uc3QgY29udGVudENvbCA9IHZhcldvcmQuc3RhcnRDb2x1bW4gKyBuYW1lTWF0Y2hbMF0ubGVuZ3RoO1xuXHRcdFx0aWYgKG5hbWVNYXRjaFsxXSA9PT0gJ2ZpbGU6Jykge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnZmlsZScsIGNvbnRlbnRSYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGNvbnRlbnRDb2wsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuZW5kQ29sdW1uKSwgcmFuZ2UgfTtcblx0XHRcdH0gZWxzZSBpZiAobmFtZU1hdGNoWzFdID09PSAndG9vbDonKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICd0b29sJywgY29udGVudFJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgY29udGVudENvbCwgcG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5lbmRDb2x1bW4pLCByYW5nZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlOiAnJywgY29udGVudFJhbmdlOiByYW5nZSwgcmFuZ2UgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29sbGVjdERlZmF1bHRDb21wbGV0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCBwcm9tcHRGaWxlVHlwZTogUHJvbXB0c1R5cGUsIHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGFiZWxzID0gcHJvbXB0RmlsZVR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyA/IFsnZmlsZSddIDogWydmaWxlJywgJ3Rvb2wnXTtcblx0XHRsYWJlbHMuZm9yRWFjaChsYWJlbCA9PiB7XG5cdFx0XHRzdWdnZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGAke2xhYmVsfTpgLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuS2V5d29yZCxcblx0XHRcdFx0aW5zZXJ0VGV4dDogYCR7bGFiZWx9OmAsXG5cdFx0XHRcdHJhbmdlOiByYW5nZSxcblx0XHRcdFx0Y29tbWFuZDogeyBpZDogJ2VkaXRvci5hY3Rpb24udHJpZ2dlclN1Z2dlc3QnLCB0aXRsZTogJ1N1Z2dlc3QnIH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxjQUFjO0FBRWhDLFNBQVMsNkJBQTZCLG1CQUFtQjtBQUV6RCxTQUFTLG9CQUFvQjtBQUU3QixTQUE0QywwQkFBa0U7QUFDOUcsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0NBQWtDO0FBT3BDLElBQU0sMkJBQU4sTUFBaUU7QUFBQSxFQVd2RSxZQUNnQyxhQUNjLDJCQUM1QztBQUY4QjtBQUNjO0FBVDlDO0FBQUE7QUFBQTtBQUFBLFNBQWdCLG9CQUE0QjtBQUs1QztBQUFBO0FBQUE7QUFBQSxTQUFnQixvQkFBb0IsQ0FBQyxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQUEsRUFNeEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYSx1QkFBdUIsT0FBbUIsVUFBb0IsU0FBNEIsT0FBK0Q7QUFDckssVUFBTSxjQUFjLDRCQUE0QixNQUFNLGNBQWMsQ0FBQztBQUNyRSxRQUFJLENBQUMsYUFBYTtBQUNqQixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sWUFBWSxNQUFNLEtBQUssc0JBQXNCLE9BQU8sVUFBVSxL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
