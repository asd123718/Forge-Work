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
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { onUnexpectedExternalError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { format } from "../../../../../../base/common/strings.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { StandardTokenType } from "../../../../../../editor/common/encodedTokenAttributes.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../../../nls.js";
import { registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { createInlineValueDecoration } from "../../../../debug/browser/debugEditorContribution.js";
import { IDebugService, State } from "../../../../debug/common/debug.js";
import { NotebookSetting } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { NotebookAction } from "../../controller/coreActions.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
class InlineSegment {
  constructor(column, text) {
    this.column = column;
    this.text = text;
  }
}
let NotebookInlineVariablesController = class extends Disposable {
  // Skip extremely large cells
  constructor(notebookEditor, notebookKernelService, notebookExecutionStateService, languageFeaturesService, configurationService, debugService) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookKernelService = notebookKernelService;
    this.notebookExecutionStateService = notebookExecutionStateService;
    this.languageFeaturesService = languageFeaturesService;
    this.configurationService = configurationService;
    this.debugService = debugService;
    this.cellDecorationIds = /* @__PURE__ */ new Map();
    this.cellContentListeners = new ResourceMap();
    this.currentCancellationTokenSources = new ResourceMap();
    this._register(this.notebookExecutionStateService.onDidChangeExecution(async (e) => {
      const inlineValuesSetting = this.configurationService.getValue(NotebookSetting.notebookInlineValues);
      if (inlineValuesSetting === "off") {
        return;
      }
      if (e.type === NotebookExecutionType.cell) {
        await this.updateInlineVariables(e);
      }
    }));
    this._register(Event.runAndSubscribe(this.configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(NotebookSetting.notebookInlineValues)) {
        if (this.configurationService.getValue(NotebookSetting.notebookInlineValues) === "off") {
          this.clearNotebookInlineDecorations();
        }
      }
    }));
  }
  async updateInlineVariables(event) {
    if (event.changed) {
      return;
    }
    const cell = this.notebookEditor.getCellByHandle(event.cellHandle);
    if (!cell) {
      return;
    }
    const existingSource = this.currentCancellationTokenSources.get(cell.uri);
    if (existingSource) {
      existingSource.cancel();
    }
    this.currentCancellationTokenSources.set(cell.uri, new CancellationTokenSource());
    const token = this.currentCancellationTokenSources.get(cell.uri).token;
    if (this.debugService.state !== State.Inactive) {
      this._clearNotebookInlineDecorations();
      return;
    }
    if (!this.notebookEditor.textModel?.uri || !isEqual(this.notebookEditor.textModel.uri, event.notebook)) {
      return;
    }
    const model = await cell.resolveTextModel();
    if (!model) {
      return;
    }
    const inlineValuesSetting = this.configurationService.getValue(NotebookSetting.notebookInlineValues);
    const hasInlineValueProvider = this.languageFeaturesService.inlineValuesProvider.has(model);
    if (inlineValuesSetting === "off" || inlineValuesSetting === "auto" && !hasInlineValueProvider) {
      return;
    }
    this.clearCellInlineDecorations(cell);
    const inlineDecorations = [];
    if (hasInlineValueProvider) {
      const lastLine = model.getLineCount();
      const lastColumn = model.getLineMaxColumn(lastLine);
      const ctx = {
        frameId: 0,
        // ignored, we won't have a stack from since not in a debug session
        stoppedLocation: new Range(lastLine, lastColumn, lastLine, lastColumn)
        // executing cell by cell, so "stopped" location would just be the end of document
      };
      const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
      const lineDecorations = /* @__PURE__ */ new Map();
      const fullCellRange = new Range(1, 1, lastLine, lastColumn);
      const promises = providers.flatMap((provider) => Promise.resolve(provider.provideInlineValues(model, fullCellRange, ctx, token)).then(async (result) => {
        if (!result) {
          return;
        }
        const notebook = this.notebookEditor.textModel;
        if (!notebook) {
          return;
        }
        const kernel = this.notebookKernelService.getMatchingKernel(notebook);
        const kernelVars = [];
        if (result.some((iv) => iv.type === "variable")) {
          if (!this.notebookEditor.hasModel()) {
            return;
          }
          const variables = kernel.selected?.provideVariables(event.notebook, void 0, "named", 0, token);
          if (variables) {
            for await (const v of variables) {
              kernelVars.push(v);
            }
          }
        }
        for (const iv of result) {
          let text = void 0;
          switch (iv.type) {
            case "text":
              text = iv.text;
              break;
            case "variable": {
              const name = iv.variableName;
              if (!name) {
                continue;
              }
              const value = kernelVars.find((v) => v.name === name)?.value;
              if (!value) {
                continue;
              }
              text = format("{0} = {1}", name, value);
              break;
            }
            case "expression": {
              continue;
            }
          }
          if (text) {
            const line = iv.range.startLineNumber;
            let lineSegments = lineDecorations.get(line);
            if (!lineSegments) {
              lineSegments = [];
              lineDecorations.set(line, lineSegments);
            }
            if (!lineSegments.some((iv2) => iv2.text === text)) {
              lineSegments.push(new InlineSegment(iv.range.startColumn, text));
            }
          }
        }
      }, (err) => {
        onUnexpectedExternalError(err);
      }));
      await Promise.all(promises);
      lineDecorations.forEach((segments, line) => {
        if (segments.length > 0) {
          segments.sort((a, b) => a.column - b.column);
          const text = segments.map((s) => s.text).join(", ");
          const editorWidth = cell.layoutInfo.editorWidth;
          const fontInfo = cell.layoutInfo.fontInfo;
          if (fontInfo && cell.textModel) {
            const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
            const lineLength = cell.textModel.getLineLength(line);
            const available = Math.max(0, base - lineLength);
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb", void 0, available));
          } else {
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb"));
          }
        }
      });
    } else if (inlineValuesSetting === "on") {
      if (!this.notebookEditor.hasModel()) {
        return;
      }
      const kernel = this.notebookKernelService.getMatchingKernel(this.notebookEditor.textModel);
      const variables = kernel?.selected?.provideVariables(event.notebook, void 0, "named", 0, token);
      if (!variables) {
        return;
      }
      const vars = [];
      for await (const v of variables) {
        vars.push(v);
      }
      const varNames = vars.map((v) => v.name);
      const document = cell.textModel;
      if (!document) {
        return;
      }
      if (document.getLineCount() > NotebookInlineVariablesController.MAX_CELL_LINES) {
        return;
      }
      const processedVars = /* @__PURE__ */ new Set();
      const functionRanges = this.getFunctionRanges(document);
      const commentedRanges = this.getCommentedRanges(document);
      const ignoredRanges = [...functionRanges, ...commentedRanges];
      const lineDecorations = /* @__PURE__ */ new Map();
      for (const varName of varNames) {
        if (processedVars.has(varName)) {
          continue;
        }
        const regex = new RegExp(`\\b${varName}\\b(?!\\w)`, "g");
        let lastMatchOutsideIgnored = null;
        let foundMatch = false;
        const lines = document.getValue().split("\n");
        for (let lineNumber = lines.length - 1; lineNumber >= 0; lineNumber--) {
          const line = lines[lineNumber];
          let match;
          while ((match = regex.exec(line)) !== null) {
            const startIndex = match.index;
            const pos = new Position(lineNumber + 1, startIndex + 1);
            if (!this.isPositionInRanges(pos, ignoredRanges)) {
              lastMatchOutsideIgnored = {
                line: lineNumber + 1,
                column: startIndex + 1
              };
              foundMatch = true;
              break;
            }
          }
          if (foundMatch) {
            break;
          }
        }
        if (lastMatchOutsideIgnored) {
          const inlineVal = varName + " = " + vars.find((v) => v.name === varName)?.value;
          let lineSegments = lineDecorations.get(lastMatchOutsideIgnored.line);
          if (!lineSegments) {
            lineSegments = [];
            lineDecorations.set(lastMatchOutsideIgnored.line, lineSegments);
          }
          if (!lineSegments.some((iv) => iv.text === inlineVal)) {
            lineSegments.push(new InlineSegment(lastMatchOutsideIgnored.column, inlineVal));
          }
        }
        processedVars.add(varName);
      }
      lineDecorations.forEach((segments, line) => {
        if (segments.length > 0) {
          segments.sort((a, b) => a.column - b.column);
          const text = segments.map((s) => s.text).join(", ");
          const editorWidth = cell.layoutInfo.editorWidth;
          const fontInfo = cell.layoutInfo.fontInfo;
          if (fontInfo && cell.textModel) {
            const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
            const lineLength = cell.textModel.getLineLength(line);
            const available = Math.max(0, base - lineLength);
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb", void 0, available));
          } else {
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb"));
          }
        }
      });
    }
    if (inlineDecorations.length > 0) {
      this.updateCellInlineDecorations(cell, inlineDecorations);
      this.initCellContentListener(cell);
    }
  }
  getFunctionRanges(document) {
    return document.getLanguageId() === "python" ? this.getPythonFunctionRanges(document.getValue()) : this.getBracedFunctionRanges(document.getValue());
  }
  getPythonFunctionRanges(code) {
    const functionRanges = [];
    const lines = code.split("\n");
    let functionStartLine = -1;
    let inFunction = false;
    let pythonIndentLevel = -1;
    const pythonFunctionDeclRegex = /^(\s*)(async\s+)?(?:def\s+\w+|class\s+\w+)\s*\([^)]*\)\s*:/;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      const pythonMatch = line.match(pythonFunctionDeclRegex);
      if (pythonMatch) {
        if (inFunction) {
          const currentIndent = pythonMatch[1].length;
          if (currentIndent <= pythonIndentLevel) {
            functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
            inFunction = false;
          }
        }
        if (!inFunction) {
          inFunction = true;
          functionStartLine = lineNumber;
          pythonIndentLevel = pythonMatch[1].length;
        }
        continue;
      }
      if (inFunction) {
        if (line.trim() === "") {
          continue;
        }
        const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
        if (currentIndent <= pythonIndentLevel) {
          functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
          inFunction = false;
          pythonIndentLevel = -1;
        }
      }
    }
    if (inFunction) {
      functionRanges.push(new Range(functionStartLine + 1, 1, lines.length, lines[lines.length - 1].length + 1));
    }
    return functionRanges;
  }
  getBracedFunctionRanges(code) {
    const functionRanges = [];
    const lines = code.split("\n");
    let braceDepth = 0;
    let functionStartLine = -1;
    let inFunction = false;
    const functionDeclRegex = /\b(?:function\s+\w+|(?:async\s+)?(?:\w+\s*=\s*)?\([^)]*\)\s*=>|class\s+\w+|(?:public|private|protected|static)?\s*\w+\s*\([^)]*\)\s*{)/;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      for (const char of line) {
        if (char === "{") {
          if (!inFunction && functionDeclRegex.test(line)) {
            inFunction = true;
            functionStartLine = lineNumber;
          }
          braceDepth++;
        } else if (char === "}") {
          braceDepth--;
          if (braceDepth === 0 && inFunction) {
            functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber + 1, line.length + 1));
            inFunction = false;
          }
        }
      }
    }
    return functionRanges;
  }
  getCommentedRanges(document) {
    return this._getCommentedRanges(document);
  }
  _getCommentedRanges(document) {
    try {
      return this.getCommentedRangesByAccurateTokenization(document);
    } catch (e) {
      return this.getCommentedRangesByManualParsing(document);
    }
  }
  getCommentedRangesByAccurateTokenization(document) {
    const commentRanges = [];
    const lineCount = document.getLineCount();
    if (lineCount > NotebookInlineVariablesController.MAX_CELL_LINES) {
      return commentRanges;
    }
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      if (!document.tokenization.hasAccurateTokensForLine(lineNumber)) {
        document.tokenization.forceTokenization(lineNumber);
      }
      const lineTokens = document.tokenization.getLineTokens(lineNumber);
      if (lineTokens.getCount() === 0) {
        continue;
      }
      let startCharacter;
      for (let tokenIndex = 0; tokenIndex < lineTokens.getCount(); tokenIndex++) {
        const tokenType = lineTokens.getStandardTokenType(tokenIndex);
        if (tokenType === StandardTokenType.Comment || tokenType === StandardTokenType.String || tokenType === StandardTokenType.RegEx) {
          if (startCharacter === void 0) {
            startCharacter = lineTokens.getStartOffset(tokenIndex);
          }
          const endCharacter = lineTokens.getEndOffset(tokenIndex);
          const isLastToken = tokenIndex === lineTokens.getCount() - 1;
          const nextTokenDifferent = !isLastToken && lineTokens.getStandardTokenType(tokenIndex + 1) !== tokenType;
          if (isLastToken || nextTokenDifferent) {
            commentRanges.push(new Range(lineNumber, startCharacter + 1, lineNumber, endCharacter + 1));
            startCharacter = void 0;
          }
        } else {
          startCharacter = void 0;
        }
      }
    }
    return commentRanges;
  }
  getCommentedRangesByManualParsing(document) {
    const commentRanges = [];
    const lines = document.getValue().split("\n");
    const languageId = document.getLanguageId();
    const lineCommentToken = languageId === "python" ? "#" : languageId === "javascript" || languageId === "typescript" ? "//" : null;
    const blockComments = languageId === "javascript" || languageId === "typescript" ? { start: "/*", end: "*/" } : null;
    let inBlockComment = false;
    let blockCommentStartLine = -1;
    let blockCommentStartCol = -1;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) {
        continue;
      }
      if (blockComments) {
        if (!inBlockComment) {
          const startIndex = line.indexOf(blockComments.start);
          if (startIndex !== -1) {
            inBlockComment = true;
            blockCommentStartLine = lineNumber;
            blockCommentStartCol = startIndex;
          }
        }
        if (inBlockComment) {
          const endIndex = line.indexOf(blockComments.end);
          if (endIndex !== -1) {
            commentRanges.push(new Range(
              blockCommentStartLine + 1,
              blockCommentStartCol + 1,
              lineNumber + 1,
              endIndex + blockComments.end.length + 1
            ));
            inBlockComment = false;
          }
          continue;
        }
      }
      if (!inBlockComment && lineCommentToken && line.trimLeft().startsWith(lineCommentToken)) {
        const startCol = line.indexOf(lineCommentToken);
        commentRanges.push(new Range(
          lineNumber + 1,
          startCol + 1,
          lineNumber + 1,
          line.length + 1
        ));
      }
    }
    if (inBlockComment) {
      commentRanges.push(new Range(
        blockCommentStartLine + 1,
        blockCommentStartCol + 1,
        lines.length,
        lines[lines.length - 1].length + 1
      ));
    }
    return commentRanges;
  }
  isPositionInRanges(position, ranges) {
    return ranges.some((range) => range.containsPosition(position));
  }
  updateCellInlineDecorations(cell, decorations) {
    const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
    this.cellDecorationIds.set(cell, cell.deltaModelDecorations(
      oldDecorations,
      decorations
    ));
  }
  initCellContentListener(cell) {
    const cellModel = cell.textModel;
    if (!cellModel) {
      return;
    }
    this.cellContentListeners.set(cell.uri, cellModel.onDidChangeContent(() => {
      this.clearCellInlineDecorations(cell);
    }));
  }
  clearCellInlineDecorations(cell) {
    const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
    if (cellDecorations) {
      cell.deltaModelDecorations(cellDecorations, []);
      this.cellDecorationIds.delete(cell);
    }
    const listener = this.cellContentListeners.get(cell.uri);
    if (listener) {
      listener.dispose();
      this.cellContentListeners.delete(cell.uri);
    }
  }
  _clearNotebookInlineDecorations() {
    this.cellDecorationIds.forEach((_, cell) => {
      this.clearCellInlineDecorations(cell);
    });
  }
  clearNotebookInlineDecorations() {
    this._clearNotebookInlineDecorations();
  }
  dispose() {
    super.dispose();
    this._clearNotebookInlineDecorations();
    this.currentCancellationTokenSources.forEach((source) => source.cancel());
    this.currentCancellationTokenSources.clear();
    this.cellContentListeners.forEach((listener) => listener.dispose());
    this.cellContentListeners.clear();
  }
};
NotebookInlineVariablesController.id = "notebook.inlineVariablesController";
NotebookInlineVariablesController.MAX_CELL_LINES = 5e3;
NotebookInlineVariablesController = __decorateClass([
  __decorateParam(1, INotebookKernelService),
  __decorateParam(2, INotebookExecutionStateService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IDebugService)
], NotebookInlineVariablesController);
registerNotebookContribution(NotebookInlineVariablesController.id, NotebookInlineVariablesController);
registerAction2(class ClearNotebookInlineValues extends NotebookAction {
  constructor() {
    super({
      id: "notebook.clearAllInlineValues",
      title: localize("clearAllInlineValues", "Clear All Inline Values")
    });
  }
  runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const controller = editor.getContribution(NotebookInlineVariablesController.id);
    controller.clearNotebookInlineDecorations();
    return Promise.resolve();
  }
});
export {
  NotebookInlineVariablesController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxub3RlYm9va1ZhcmlhYmxlc1xcbm90ZWJvb2tJbmxpbmVWYXJpYWJsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBmb3JtYXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElubGluZVZhbHVlQ29udGV4dCwgSW5saW5lVmFsdWVUZXh0LCBJbmxpbmVWYWx1ZVZhcmlhYmxlTG9va3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2RlYnVnL2Jyb3dzZXIvZGVidWdFZGl0b3JDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElDZWxsRXhlY3V0aW9uU3RhdGVDaGFuZ2VkRXZlbnQsIElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgTm90ZWJvb2tFeGVjdXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsIFZhcmlhYmxlc1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQWN0aW9uQ29udGV4dCwgTm90ZWJvb2tBY3Rpb24gfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzJztcblxuY2xhc3MgSW5saW5lU2VnbWVudCB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBjb2x1bW46IG51bWJlciwgcHVibGljIHRleHQ6IHN0cmluZykge1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0lubGluZVZhcmlhYmxlc0NvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQ6IHN0cmluZyA9ICdub3RlYm9vay5pbmxpbmVWYXJpYWJsZXNDb250cm9sbGVyJztcblxuXHRwcml2YXRlIGNlbGxEZWNvcmF0aW9uSWRzID0gbmV3IE1hcDxJQ2VsbFZpZXdNb2RlbCwgc3RyaW5nW10+KCk7XG5cdHByaXZhdGUgY2VsbENvbnRlbnRMaXN0ZW5lcnMgPSBuZXcgUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCk7XG5cblx0cHJpdmF0ZSBjdXJyZW50Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2VzID0gbmV3IFJlc291cmNlTWFwPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9DRUxMX0xJTkVTID0gNTAwMDsgLy8gU2tpcCBleHRyZW1lbHkgbGFyZ2UgY2VsbHNcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRXhlY3V0aW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgaW5saW5lVmFsdWVzU2V0dGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J29uJyB8ICdhdXRvJyB8ICdvZmYnPihOb3RlYm9va1NldHRpbmcubm90ZWJvb2tJbmxpbmVWYWx1ZXMpO1xuXHRcdFx0aWYgKGlubGluZVZhbHVlc1NldHRpbmcgPT09ICdvZmYnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUudHlwZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UeXBlLmNlbGwpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVJbmxpbmVWYXJpYWJsZXMoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IHtcblx0XHRcdGlmICghZSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5ub3RlYm9va0lubGluZVZhbHVlcykpIHtcblx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J29uJyB8ICdhdXRvJyB8ICdvZmYnPihOb3RlYm9va1NldHRpbmcubm90ZWJvb2tJbmxpbmVWYWx1ZXMpID09PSAnb2ZmJykge1xuXHRcdFx0XHRcdHRoaXMuY2xlYXJOb3RlYm9va0lubGluZURlY29yYXRpb25zKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUlubGluZVZhcmlhYmxlcyhldmVudDogSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChldmVudC5jaGFuZ2VkKSB7IC8vIHVuZGVmaW5lZCAtPiBleGVjdXRpb24gd2FzIGNvbXBsZXRlZCwgc28gcmV0dXJuIG9uIGFsbCBlbHNlLiBubyBjb2RlIHNob3VsZCBleGVjdXRlIHVudGlsIHdlIGtub3cgaXQncyBhbiBleGVjdXRpb24gY29tcGxldGlvblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUhhbmRsZShldmVudC5jZWxsSGFuZGxlKTtcblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDYW5jZWwgYW55IG9uZ29pbmcgcmVxdWVzdCBpbiB0aGlzIGNlbGxcblx0XHRjb25zdCBleGlzdGluZ1NvdXJjZSA9IHRoaXMuY3VycmVudENhbmNlbGxhdGlvblRva2VuU291cmNlcy5nZXQoY2VsbC51cmkpO1xuXHRcdGlmIChleGlzdGluZ1NvdXJjZSkge1xuXHRcdFx0ZXhpc3RpbmdTb3VyY2UuY2FuY2VsKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlIGZvciB0aGUgbmV3IHJlcXVlc3QgcGVyIGNlbGxcblx0XHR0aGlzLmN1cnJlbnRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZXMuc2V0KGNlbGwudXJpLCBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLmN1cnJlbnRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZXMuZ2V0KGNlbGwudXJpKSEudG9rZW47XG5cblx0XHRpZiAodGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUgIT09IFN0YXRlLkluYWN0aXZlKSB7XG5cdFx0XHR0aGlzLl9jbGVhck5vdGVib29rSW5saW5lRGVjb3JhdGlvbnMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsPy51cmkgfHwgIWlzRXF1YWwodGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwudXJpLCBldmVudC5ub3RlYm9vaykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IGNlbGwucmVzb2x2ZVRleHRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmxpbmVWYWx1ZXNTZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnb24nIHwgJ2F1dG8nIHwgJ29mZic+KE5vdGVib29rU2V0dGluZy5ub3RlYm9va0lubGluZVZhbHVlcyk7XG5cdFx0Y29uc3QgaGFzSW5saW5lVmFsdWVQcm92aWRlciA9IHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lVmFsdWVzUHJvdmlkZXIuaGFzKG1vZGVsKTtcblxuXHRcdC8vIFNraXAgaWYgc2V0dGluZyBpcyBvZmYgb3IgaWYgYXV0byBhbmQgbm8gcHJvdmlkZXIgaXMgcmVnaXN0ZXJlZFxuXHRcdGlmIChpbmxpbmVWYWx1ZXNTZXR0aW5nID09PSAnb2ZmJyB8fCAoaW5saW5lVmFsdWVzU2V0dGluZyA9PT0gJ2F1dG8nICYmICFoYXNJbmxpbmVWYWx1ZVByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY2xlYXJDZWxsSW5saW5lRGVjb3JhdGlvbnMoY2VsbCk7XG5cblx0XHRjb25zdCBpbmxpbmVEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblxuXHRcdGlmIChoYXNJbmxpbmVWYWx1ZVByb3ZpZGVyKSB7XG5cdFx0XHQvLyB1c2UgZXh0ZW5zaW9uIGJhc2VkIHByb3ZpZGVyLCBib3Jyb3dlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvbWFpbi9zcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z0VkaXRvckNvbnRyaWJ1dGlvbi50cyNMNjc5XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbGFzdENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGFzdExpbmUpO1xuXHRcdFx0Y29uc3QgY3R4OiBJbmxpbmVWYWx1ZUNvbnRleHQgPSB7XG5cdFx0XHRcdGZyYW1lSWQ6IDAsIC8vIGlnbm9yZWQsIHdlIHdvbid0IGhhdmUgYSBzdGFjayBmcm9tIHNpbmNlIG5vdCBpbiBhIGRlYnVnIHNlc3Npb25cblx0XHRcdFx0c3RvcHBlZExvY2F0aW9uOiBuZXcgUmFuZ2UobGFzdExpbmUsIGxhc3RDb2x1bW4sIGxhc3RMaW5lLCBsYXN0Q29sdW1uKSAvLyBleGVjdXRpbmcgY2VsbCBieSBjZWxsLCBzbyBcInN0b3BwZWRcIiBsb2NhdGlvbiB3b3VsZCBqdXN0IGJlIHRoZSBlbmQgb2YgZG9jdW1lbnRcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lVmFsdWVzUHJvdmlkZXIub3JkZXJlZChtb2RlbCkucmV2ZXJzZSgpO1xuXHRcdFx0Y29uc3QgbGluZURlY29yYXRpb25zID0gbmV3IE1hcDxudW1iZXIsIElubGluZVNlZ21lbnRbXT4oKTtcblxuXHRcdFx0Y29uc3QgZnVsbENlbGxSYW5nZSA9IG5ldyBSYW5nZSgxLCAxLCBsYXN0TGluZSwgbGFzdENvbHVtbik7XG5cblx0XHRcdGNvbnN0IHByb21pc2VzID0gcHJvdmlkZXJzLmZsYXRNYXAocHJvdmlkZXIgPT4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLnByb3ZpZGVJbmxpbmVWYWx1ZXMobW9kZWwsIGZ1bGxDZWxsUmFuZ2UsIGN0eCwgdG9rZW4pKS50aGVuKGFzeW5jIChyZXN1bHQpID0+IHtcblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0XHRpZiAoIW5vdGVib29rKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qga2VybmVsID0gdGhpcy5ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwobm90ZWJvb2spO1xuXHRcdFx0XHRjb25zdCBrZXJuZWxWYXJzOiBWYXJpYWJsZXNSZXN1bHRbXSA9IFtdO1xuXHRcdFx0XHRpZiAocmVzdWx0LnNvbWUoaXYgPT4gaXYudHlwZSA9PT0gJ3ZhcmlhYmxlJykpIHsgLy8gaWYgYW55b25lIHdpbGwgbmVlZCBhIGxvb2t1cCwgZ2V0IHZhcnMgbm93IHRvIGF2b2lkIG5lZWRpbmcgdG8gZG8gaXQgbXVsdGlwbGUgdGltZXNcblx0XHRcdFx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuOyAvLyBzaG91bGQgbm90IGhhcHBlbiwgYSBjZWxsIHdpbGwgYmUgZXhlY3V0ZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgdmFyaWFibGVzID0ga2VybmVsLnNlbGVjdGVkPy5wcm92aWRlVmFyaWFibGVzKGV2ZW50Lm5vdGVib29rLCB1bmRlZmluZWQsICduYW1lZCcsIDAsIHRva2VuKTtcblx0XHRcdFx0XHRpZiAodmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHYgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0XHRcdGtlcm5lbFZhcnMucHVzaCh2KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IGl2IG9mIHJlc3VsdCkge1xuXHRcdFx0XHRcdGxldCB0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0c3dpdGNoIChpdi50eXBlKSB7XG5cdFx0XHRcdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0XHRcdFx0dGV4dCA9IChpdiBhcyBJbmxpbmVWYWx1ZVRleHQpLnRleHQ7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAndmFyaWFibGUnOiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5hbWUgPSAoaXYgYXMgSW5saW5lVmFsdWVWYXJpYWJsZUxvb2t1cCkudmFyaWFibGVOYW1lO1xuXHRcdFx0XHRcdFx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gc2tpcCB0byBuZXh0IHZhciwgbm8gdmFsaWQgbmFtZSB0byBsb29rdXAgd2l0aFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0ga2VybmVsVmFycy5maW5kKHYgPT4gdi5uYW1lID09PSBuYW1lKT8udmFsdWU7XG5cdFx0XHRcdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0ZXh0ID0gZm9ybWF0KCd7MH0gPSB7MX0nLCBuYW1lLCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2FzZSAnZXhwcmVzc2lvbic6IHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7IC8vIG5vIGFjdGl2ZSBkZWJ1ZyBzZXNzaW9uLCBzbyBldmFsdWF0ZSB3b3VsZCBicmVha1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lID0gaXYucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0bGV0IGxpbmVTZWdtZW50cyA9IGxpbmVEZWNvcmF0aW9ucy5nZXQobGluZSk7XG5cdFx0XHRcdFx0XHRpZiAoIWxpbmVTZWdtZW50cykge1xuXHRcdFx0XHRcdFx0XHRsaW5lU2VnbWVudHMgPSBbXTtcblx0XHRcdFx0XHRcdFx0bGluZURlY29yYXRpb25zLnNldChsaW5lLCBsaW5lU2VnbWVudHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFsaW5lU2VnbWVudHMuc29tZShpdiA9PiBpdi50ZXh0ID09PSB0ZXh0KSkgeyAvLyBkZS1kdXBlXG5cdFx0XHRcdFx0XHRcdGxpbmVTZWdtZW50cy5wdXNoKG5ldyBJbmxpbmVTZWdtZW50KGl2LnJhbmdlLnN0YXJ0Q29sdW1uLCB0ZXh0KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKGVycik7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuXHRcdFx0Ly8gc29ydCBsaW5lIHNlZ21lbnRzIGFuZCBjb25jYXRlbmF0ZSB0aGVtIGludG8gYSBkZWNvcmF0aW9uXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnMuZm9yRWFjaCgoc2VnbWVudHMsIGxpbmUpID0+IHtcblx0XHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzZWdtZW50cy5zb3J0KChhLCBiKSA9PiBhLmNvbHVtbiAtIGIuY29sdW1uKTtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gc2VnbWVudHMubWFwKHMgPT4gcy50ZXh0KS5qb2luKCcsICcpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvcldpZHRoID0gY2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRoO1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRJbmZvID0gY2VsbC5sYXlvdXRJbmZvLmZvbnRJbmZvO1xuXHRcdFx0XHRcdGlmIChmb250SW5mbyAmJiBjZWxsLnRleHRNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYmFzZSA9IE1hdGguZmxvb3IoKGVkaXRvcldpZHRoIC0gNTApIC8gZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSBjZWxsLnRleHRNb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgYXZhaWxhYmxlID0gTWF0aC5tYXgoMCwgYmFzZSAtIGxpbmVMZW5ndGgpO1xuXHRcdFx0XHRcdFx0aW5saW5lRGVjb3JhdGlvbnMucHVzaCguLi5jcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb24obGluZSwgdGV4dCwgJ25iJywgdW5kZWZpbmVkLCBhdmFpbGFibGUpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aW5saW5lRGVjb3JhdGlvbnMucHVzaCguLi5jcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb24obGluZSwgdGV4dCwgJ25iJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHR9IGVsc2UgaWYgKGlubGluZVZhbHVlc1NldHRpbmcgPT09ICdvbicpIHsgLy8gZmFsbGJhY2sgYXBwcm9hY2ggb25seSB3aGVuIHNldHRpbmcgaXMgJ29uJ1xuXHRcdFx0aWYgKCF0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBzaG91bGQgbm90IGhhcHBlbiwgYSBjZWxsIHdpbGwgYmUgZXhlY3V0ZWRcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtlcm5lbCA9IHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsKTtcblx0XHRcdGNvbnN0IHZhcmlhYmxlcyA9IGtlcm5lbD8uc2VsZWN0ZWQ/LnByb3ZpZGVWYXJpYWJsZXMoZXZlbnQubm90ZWJvb2ssIHVuZGVmaW5lZCwgJ25hbWVkJywgMCwgdG9rZW4pO1xuXHRcdFx0aWYgKCF2YXJpYWJsZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2YXJzOiBWYXJpYWJsZXNSZXN1bHRbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCB2IG9mIHZhcmlhYmxlcykge1xuXHRcdFx0XHR2YXJzLnB1c2godik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YXJOYW1lczogc3RyaW5nW10gPSB2YXJzLm1hcCh2ID0+IHYubmFtZSk7XG5cblx0XHRcdGNvbnN0IGRvY3VtZW50ID0gY2VsbC50ZXh0TW9kZWw7XG5cdFx0XHRpZiAoIWRvY3VtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2tpcCBwcm9jZXNzaW5nIGZvciBleHRyZW1lbHkgbGFyZ2UgY2VsbHNcblx0XHRcdGlmIChkb2N1bWVudC5nZXRMaW5lQ291bnQoKSA+IE5vdGVib29rSW5saW5lVmFyaWFibGVzQ29udHJvbGxlci5NQVhfQ0VMTF9MSU5FUykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb2Nlc3NlZFZhcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdFx0Ly8gR2V0IGJvdGggZnVuY3Rpb24gcmFuZ2VzIGFuZCBjb21tZW50IHJhbmdlc1xuXHRcdFx0Y29uc3QgZnVuY3Rpb25SYW5nZXMgPSB0aGlzLmdldEZ1bmN0aW9uUmFuZ2VzKGRvY3VtZW50KTtcblx0XHRcdGNvbnN0IGNvbW1lbnRlZFJhbmdlcyA9IHRoaXMuZ2V0Q29tbWVudGVkUmFuZ2VzKGRvY3VtZW50KTtcblx0XHRcdGNvbnN0IGlnbm9yZWRSYW5nZXMgPSBbLi4uZnVuY3Rpb25SYW5nZXMsIC4uLmNvbW1lbnRlZFJhbmdlc107XG5cdFx0XHRjb25zdCBsaW5lRGVjb3JhdGlvbnMgPSBuZXcgTWFwPG51bWJlciwgSW5saW5lU2VnbWVudFtdPigpO1xuXG5cdFx0XHQvLyBGb3IgZWFjaCB2YXJpYWJsZSBuYW1lIGZvdW5kIGluIHRoZSBrZXJuZWwgcmVzdWx0c1xuXHRcdFx0Zm9yIChjb25zdCB2YXJOYW1lIG9mIHZhck5hbWVzKSB7XG5cdFx0XHRcdGlmIChwcm9jZXNzZWRWYXJzLmhhcyh2YXJOYW1lKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgdmFyaWFibGUgdXNhZ2UgZ2xvYmFsbHkgLSB1c2luZyB3b3JkIGJvdW5kYXJpZXMgdG8gZW5zdXJlIGV4YWN0IG1hdGNoZXNcblx0XHRcdFx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7dmFyTmFtZX1cXFxcYig/IVxcXFx3KWAsICdnJyk7XG5cdFx0XHRcdGxldCBsYXN0TWF0Y2hPdXRzaWRlSWdub3JlZDogeyBsaW5lOiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblx0XHRcdFx0bGV0IGZvdW5kTWF0Y2ggPSBmYWxzZTtcblxuXHRcdFx0XHQvLyBTY2FuIGxpbmVzIGluIHJldmVyc2UgdG8gZmluZCBsYXN0IG9jY3VycmVuY2UgZmlyc3Rcblx0XHRcdFx0Y29uc3QgbGluZXMgPSBkb2N1bWVudC5nZXRWYWx1ZSgpLnNwbGl0KCdcXG4nKTtcblx0XHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IGxpbmVzLmxlbmd0aCAtIDE7IGxpbmVOdW1iZXIgPj0gMDsgbGluZU51bWJlci0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2xpbmVOdW1iZXJdO1xuXHRcdFx0XHRcdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuXHRcdFx0XHRcdHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKGxpbmUpKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhcnRJbmRleCA9IG1hdGNoLmluZGV4O1xuXHRcdFx0XHRcdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIgKyAxLCBzdGFydEluZGV4ICsgMSk7XG5cblx0XHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgcG9zaXRpb24gaXMgaW4gYW55IGlnbm9yZWQgcmFuZ2UgKGZ1bmN0aW9uIG9yIGNvbW1lbnQpXG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuaXNQb3NpdGlvbkluUmFuZ2VzKHBvcywgaWdub3JlZFJhbmdlcykpIHtcblx0XHRcdFx0XHRcdFx0bGFzdE1hdGNoT3V0c2lkZUlnbm9yZWQgPSB7XG5cdFx0XHRcdFx0XHRcdFx0bGluZTogbGluZU51bWJlciArIDEsXG5cdFx0XHRcdFx0XHRcdFx0Y29sdW1uOiBzdGFydEluZGV4ICsgMVxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRmb3VuZE1hdGNoID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7IC8vIFRha2UgZmlyc3QgbWF0Y2ggaW4gcmV2ZXJzZSBvcmRlciAod2hpY2ggaXMgbGFzdCBjaHJvbm9sb2dpY2FsbHkpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGZvdW5kTWF0Y2gpIHtcblx0XHRcdFx0XHRcdGJyZWFrOyAvLyBXZSBmb3VuZCBvdXIgbGFzdCB2YWxpZCBvY2N1cnJlbmNlLCBubyBuZWVkIHRvIGNoZWNrIGVhcmxpZXIgbGluZXNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobGFzdE1hdGNoT3V0c2lkZUlnbm9yZWQpIHtcblx0XHRcdFx0XHRjb25zdCBpbmxpbmVWYWwgPSB2YXJOYW1lICsgJyA9ICcgKyB2YXJzLmZpbmQodiA9PiB2Lm5hbWUgPT09IHZhck5hbWUpPy52YWx1ZTtcblxuXHRcdFx0XHRcdGxldCBsaW5lU2VnbWVudHMgPSBsaW5lRGVjb3JhdGlvbnMuZ2V0KGxhc3RNYXRjaE91dHNpZGVJZ25vcmVkLmxpbmUpO1xuXHRcdFx0XHRcdGlmICghbGluZVNlZ21lbnRzKSB7XG5cdFx0XHRcdFx0XHRsaW5lU2VnbWVudHMgPSBbXTtcblx0XHRcdFx0XHRcdGxpbmVEZWNvcmF0aW9ucy5zZXQobGFzdE1hdGNoT3V0c2lkZUlnbm9yZWQubGluZSwgbGluZVNlZ21lbnRzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFsaW5lU2VnbWVudHMuc29tZShpdiA9PiBpdi50ZXh0ID09PSBpbmxpbmVWYWwpKSB7IC8vIGRlLWR1cGVcblx0XHRcdFx0XHRcdGxpbmVTZWdtZW50cy5wdXNoKG5ldyBJbmxpbmVTZWdtZW50KGxhc3RNYXRjaE91dHNpZGVJZ25vcmVkLmNvbHVtbiwgaW5saW5lVmFsKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJvY2Vzc2VkVmFycy5hZGQodmFyTmFtZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNvcnQgbGluZSBzZWdtZW50cyBhbmQgY29uY2F0ZW5hdGUgdGhlbSBpbnRvIGEgZGVjb3JhdGlvblxuXHRcdFx0bGluZURlY29yYXRpb25zLmZvckVhY2goKHNlZ21lbnRzLCBsaW5lKSA9PiB7XG5cdFx0XHRcdGlmIChzZWdtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VnbWVudHMuc29ydCgoYSwgYikgPT4gYS5jb2x1bW4gLSBiLmNvbHVtbik7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dCA9IHNlZ21lbnRzLm1hcChzID0+IHMudGV4dCkuam9pbignLCAnKTtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JXaWR0aCA9IGNlbGwubGF5b3V0SW5mby5lZGl0b3JXaWR0aDtcblx0XHRcdFx0XHRjb25zdCBmb250SW5mbyA9IGNlbGwubGF5b3V0SW5mby5mb250SW5mbztcblx0XHRcdFx0XHRpZiAoZm9udEluZm8gJiYgY2VsbC50ZXh0TW9kZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJhc2UgPSBNYXRoLmZsb29yKChlZGl0b3JXaWR0aCAtIDUwKSAvIGZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCk7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lTGVuZ3RoID0gY2VsbC50ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lKTtcblx0XHRcdFx0XHRcdGNvbnN0IGF2YWlsYWJsZSA9IE1hdGgubWF4KDAsIGJhc2UgLSBsaW5lTGVuZ3RoKTtcblx0XHRcdFx0XHRcdGlubGluZURlY29yYXRpb25zLnB1c2goLi4uY3JlYXRlSW5saW5lVmFsdWVEZWNvcmF0aW9uKGxpbmUsIHRleHQsICduYicsIHVuZGVmaW5lZCwgYXZhaWxhYmxlKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlubGluZURlY29yYXRpb25zLnB1c2goLi4uY3JlYXRlSW5saW5lVmFsdWVEZWNvcmF0aW9uKGxpbmUsIHRleHQsICduYicpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChpbmxpbmVEZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNlbGxJbmxpbmVEZWNvcmF0aW9ucyhjZWxsLCBpbmxpbmVEZWNvcmF0aW9ucyk7XG5cdFx0XHR0aGlzLmluaXRDZWxsQ29udGVudExpc3RlbmVyKGNlbGwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0RnVuY3Rpb25SYW5nZXMoZG9jdW1lbnQ6IElUZXh0TW9kZWwpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gZG9jdW1lbnQuZ2V0TGFuZ3VhZ2VJZCgpID09PSAncHl0aG9uJ1xuXHRcdFx0PyB0aGlzLmdldFB5dGhvbkZ1bmN0aW9uUmFuZ2VzKGRvY3VtZW50LmdldFZhbHVlKCkpXG5cdFx0XHQ6IHRoaXMuZ2V0QnJhY2VkRnVuY3Rpb25SYW5nZXMoZG9jdW1lbnQuZ2V0VmFsdWUoKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFB5dGhvbkZ1bmN0aW9uUmFuZ2VzKGNvZGU6IHN0cmluZyk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IGZ1bmN0aW9uUmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0Y29uc3QgbGluZXMgPSBjb2RlLnNwbGl0KCdcXG4nKTtcblx0XHRsZXQgZnVuY3Rpb25TdGFydExpbmUgPSAtMTtcblx0XHRsZXQgaW5GdW5jdGlvbiA9IGZhbHNlO1xuXHRcdGxldCBweXRob25JbmRlbnRMZXZlbCA9IC0xO1xuXHRcdGNvbnN0IHB5dGhvbkZ1bmN0aW9uRGVjbFJlZ2V4ID0gL14oXFxzKikoYXN5bmNcXHMrKT8oPzpkZWZcXHMrXFx3K3xjbGFzc1xccytcXHcrKVxccypcXChbXildKlxcKVxccyo6LztcblxuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSAwOyBsaW5lTnVtYmVyIDwgbGluZXMubGVuZ3RoOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tsaW5lTnVtYmVyXTtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIFB5dGhvbiBmdW5jdGlvbi9jbGFzcyBkZWNsYXJhdGlvbnNcblx0XHRcdGNvbnN0IHB5dGhvbk1hdGNoID0gbGluZS5tYXRjaChweXRob25GdW5jdGlvbkRlY2xSZWdleCk7XG5cdFx0XHRpZiAocHl0aG9uTWF0Y2gpIHtcblx0XHRcdFx0aWYgKGluRnVuY3Rpb24pIHtcblx0XHRcdFx0XHQvLyBJZiB3ZSdyZSBhbHJlYWR5IGluIGEgZnVuY3Rpb24gYW5kIGZpbmQgYW5vdGhlciBhdCB0aGUgc2FtZSBvciBsb3dlciBpbmRlbnQsIGNsb3NlIHRoZSBjdXJyZW50IG9uZVxuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRJbmRlbnQgPSBweXRob25NYXRjaFsxXS5sZW5ndGg7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRJbmRlbnQgPD0gcHl0aG9uSW5kZW50TGV2ZWwpIHtcblx0XHRcdFx0XHRcdGZ1bmN0aW9uUmFuZ2VzLnB1c2gobmV3IFJhbmdlKGZ1bmN0aW9uU3RhcnRMaW5lICsgMSwgMSwgbGluZU51bWJlciwgbGluZS5sZW5ndGggKyAxKSk7XG5cdFx0XHRcdFx0XHRpbkZ1bmN0aW9uID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpbkZ1bmN0aW9uKSB7XG5cdFx0XHRcdFx0aW5GdW5jdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0ZnVuY3Rpb25TdGFydExpbmUgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHRcdHB5dGhvbkluZGVudExldmVsID0gcHl0aG9uTWF0Y2hbMV0ubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpbmRlbnRhdGlvbiBmb3IgUHl0aG9uIGZ1bmN0aW9uc1xuXHRcdFx0aWYgKGluRnVuY3Rpb24pIHtcblx0XHRcdFx0Ly8gU2tpcCBlbXB0eSBsaW5lc1xuXHRcdFx0XHRpZiAobGluZS50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBHZXQgdGhlIGluZGVudGF0aW9uIG9mIHRoZSBjdXJyZW50IGxpbmVcblx0XHRcdFx0Y29uc3QgY3VycmVudEluZGVudCA9IGxpbmUubWF0Y2goL15cXHMqLyk/LlswXS5sZW5ndGggPz8gMDtcblxuXHRcdFx0XHQvLyBJZiB3ZSBoaXQgYSBsaW5lIHdpdGggc2FtZSBvciBsb3dlciBpbmRlbnRhdGlvbiB0aGFuIHdoZXJlIHRoZSBmdW5jdGlvbiBzdGFydGVkLFxuXHRcdFx0XHQvLyB3ZSd2ZSBleGl0ZWQgdGhlIGZ1bmN0aW9uXG5cdFx0XHRcdGlmIChjdXJyZW50SW5kZW50IDw9IHB5dGhvbkluZGVudExldmVsKSB7XG5cdFx0XHRcdFx0ZnVuY3Rpb25SYW5nZXMucHVzaChuZXcgUmFuZ2UoZnVuY3Rpb25TdGFydExpbmUgKyAxLCAxLCBsaW5lTnVtYmVyLCBsaW5lLmxlbmd0aCArIDEpKTtcblx0XHRcdFx0XHRpbkZ1bmN0aW9uID0gZmFsc2U7XG5cdFx0XHRcdFx0cHl0aG9uSW5kZW50TGV2ZWwgPSAtMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBjYXNlIHdoZXJlIFB5dGhvbiBmdW5jdGlvbiBpcyBhdCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudFxuXHRcdGlmIChpbkZ1bmN0aW9uKSB7XG5cdFx0XHRmdW5jdGlvblJhbmdlcy5wdXNoKG5ldyBSYW5nZShmdW5jdGlvblN0YXJ0TGluZSArIDEsIDEsIGxpbmVzLmxlbmd0aCwgbGluZXNbbGluZXMubGVuZ3RoIC0gMV0ubGVuZ3RoICsgMSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmdW5jdGlvblJhbmdlcztcblx0fVxuXG5cdHByaXZhdGUgZ2V0QnJhY2VkRnVuY3Rpb25SYW5nZXMoY29kZTogc3RyaW5nKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgZnVuY3Rpb25SYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBsaW5lcyA9IGNvZGUuc3BsaXQoJ1xcbicpO1xuXHRcdGxldCBicmFjZURlcHRoID0gMDtcblx0XHRsZXQgZnVuY3Rpb25TdGFydExpbmUgPSAtMTtcblx0XHRsZXQgaW5GdW5jdGlvbiA9IGZhbHNlO1xuXHRcdGNvbnN0IGZ1bmN0aW9uRGVjbFJlZ2V4ID0gL1xcYig/OmZ1bmN0aW9uXFxzK1xcdyt8KD86YXN5bmNcXHMrKT8oPzpcXHcrXFxzKj1cXHMqKT9cXChbXildKlxcKVxccyo9PnxjbGFzc1xccytcXHcrfCg/OnB1YmxpY3xwcml2YXRlfHByb3RlY3RlZHxzdGF0aWMpP1xccypcXHcrXFxzKlxcKFteKV0qXFwpXFxzKnspLztcblxuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSAwOyBsaW5lTnVtYmVyIDwgbGluZXMubGVuZ3RoOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tsaW5lTnVtYmVyXTtcblx0XHRcdGZvciAoY29uc3QgY2hhciBvZiBsaW5lKSB7XG5cdFx0XHRcdGlmIChjaGFyID09PSAneycpIHtcblx0XHRcdFx0XHRpZiAoIWluRnVuY3Rpb24gJiYgZnVuY3Rpb25EZWNsUmVnZXgudGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0aW5GdW5jdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0XHRmdW5jdGlvblN0YXJ0TGluZSA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyYWNlRGVwdGgrKztcblx0XHRcdFx0fSBlbHNlIGlmIChjaGFyID09PSAnfScpIHtcblx0XHRcdFx0XHRicmFjZURlcHRoLS07XG5cdFx0XHRcdFx0aWYgKGJyYWNlRGVwdGggPT09IDAgJiYgaW5GdW5jdGlvbikge1xuXHRcdFx0XHRcdFx0ZnVuY3Rpb25SYW5nZXMucHVzaChuZXcgUmFuZ2UoZnVuY3Rpb25TdGFydExpbmUgKyAxLCAxLCBsaW5lTnVtYmVyICsgMSwgbGluZS5sZW5ndGggKyAxKSk7XG5cdFx0XHRcdFx0XHRpbkZ1bmN0aW9uID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZ1bmN0aW9uUmFuZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21tZW50ZWRSYW5nZXMoZG9jdW1lbnQ6IElUZXh0TW9kZWwpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29tbWVudGVkUmFuZ2VzKGRvY3VtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbW1lbnRlZFJhbmdlcyhkb2N1bWVudDogSVRleHRNb2RlbCk6IFJhbmdlW10ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRDb21tZW50ZWRSYW5nZXNCeUFjY3VyYXRlVG9rZW5pemF0aW9uKGRvY3VtZW50KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBGYWxsIGJhY2sgdG8gbWFudWFsIHBhcnNpbmcgaWYgdG9rZW5pemF0aW9uIGZhaWxzXG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRDb21tZW50ZWRSYW5nZXNCeU1hbnVhbFBhcnNpbmcoZG9jdW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29tbWVudGVkUmFuZ2VzQnlBY2N1cmF0ZVRva2VuaXphdGlvbihkb2N1bWVudDogSVRleHRNb2RlbCk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IGNvbW1lbnRSYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBkb2N1bWVudC5nZXRMaW5lQ291bnQoKTtcblxuXHRcdC8vIFNraXAgcHJvY2Vzc2luZyBmb3IgZXh0cmVtZWx5IGxhcmdlIGRvY3VtZW50c1xuXHRcdGlmIChsaW5lQ291bnQgPiBOb3RlYm9va0lubGluZVZhcmlhYmxlc0NvbnRyb2xsZXIuTUFYX0NFTExfTElORVMpIHtcblx0XHRcdHJldHVybiBjb21tZW50UmFuZ2VzO1xuXHRcdH1cblxuXHRcdC8vIFByb2Nlc3MgZWFjaCBsaW5lIC0gZm9yY2UgdG9rZW5pemF0aW9uIGlmIG5lZWRlZCBhbmQgcHJvY2VzcyB0b2tlbnMgaW4gYSBzaW5nbGUgcGFzc1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSAxOyBsaW5lTnVtYmVyIDw9IGxpbmVDb3VudDsgbGluZU51bWJlcisrKSB7XG5cdFx0XHQvLyBGb3JjZSB0b2tlbml6YXRpb24gaWYgbmVlZGVkXG5cdFx0XHRpZiAoIWRvY3VtZW50LnRva2VuaXphdGlvbi5oYXNBY2N1cmF0ZVRva2Vuc0ZvckxpbmUobGluZU51bWJlcikpIHtcblx0XHRcdFx0ZG9jdW1lbnQudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gZG9jdW1lbnQudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cblx0XHRcdC8vIFNraXAgbGluZXMgd2l0aCBubyB0b2tlbnNcblx0XHRcdGlmIChsaW5lVG9rZW5zLmdldENvdW50KCkgPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzdGFydENoYXJhY3RlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBDaGVjayBlYWNoIHRva2VuIGluIHRoZSBsaW5lXG5cdFx0XHRmb3IgKGxldCB0b2tlbkluZGV4ID0gMDsgdG9rZW5JbmRleCA8IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTsgdG9rZW5JbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuVHlwZSA9IGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCk7XG5cblx0XHRcdFx0aWYgKHRva2VuVHlwZSA9PT0gU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB8fCB0b2tlblR5cGUgPT09IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB8fCB0b2tlblR5cGUgPT09IFN0YW5kYXJkVG9rZW5UeXBlLlJlZ0V4KSB7XG5cdFx0XHRcdFx0aWYgKHN0YXJ0Q2hhcmFjdGVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdC8vIFN0YXJ0IG9mIGEgY29tbWVudCBvciBzdHJpbmdcblx0XHRcdFx0XHRcdHN0YXJ0Q2hhcmFjdGVyID0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBlbmRDaGFyYWN0ZXIgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblxuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgdGhlIGVuZCBvZiB0aGUgY29tbWVudC9zdHJpbmcgc2VjdGlvbiAoZWl0aGVyIGVuZCBvZiBsaW5lIG9yIGRpZmZlcmVudCB0b2tlbiB0eXBlIGZvbGxvd3MpXG5cdFx0XHRcdFx0Y29uc3QgaXNMYXN0VG9rZW4gPSB0b2tlbkluZGV4ID09PSBsaW5lVG9rZW5zLmdldENvdW50KCkgLSAxO1xuXHRcdFx0XHRcdGNvbnN0IG5leHRUb2tlbkRpZmZlcmVudCA9ICFpc0xhc3RUb2tlbiAmJlxuXHRcdFx0XHRcdFx0bGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4ICsgMSkgIT09IHRva2VuVHlwZTtcblxuXHRcdFx0XHRcdGlmIChpc0xhc3RUb2tlbiB8fCBuZXh0VG9rZW5EaWZmZXJlbnQpIHtcblx0XHRcdFx0XHRcdC8vIEVuZCBvZiBjb21tZW50L3N0cmluZyBzZWN0aW9uXG5cdFx0XHRcdFx0XHRjb21tZW50UmFuZ2VzLnB1c2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIHN0YXJ0Q2hhcmFjdGVyICsgMSwgbGluZU51bWJlciwgZW5kQ2hhcmFjdGVyICsgMSkpO1xuXHRcdFx0XHRcdFx0c3RhcnRDaGFyYWN0ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFJlc2V0IHdoZW4gd2UgaGl0IGEgbm9uLWNvbW1lbnQsIG5vbi1zdHJpbmcgdG9rZW5cblx0XHRcdFx0XHRzdGFydENoYXJhY3RlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb21tZW50UmFuZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21tZW50ZWRSYW5nZXNCeU1hbnVhbFBhcnNpbmcoZG9jdW1lbnQ6IElUZXh0TW9kZWwpOiBSYW5nZVtdIHtcblx0XHRjb25zdCBjb21tZW50UmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0Y29uc3QgbGluZXMgPSBkb2N1bWVudC5nZXRWYWx1ZSgpLnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gZG9jdW1lbnQuZ2V0TGFuZ3VhZ2VJZCgpO1xuXG5cdFx0Ly8gRGlmZmVyZW50IGNvbW1lbnQgcGF0dGVybnMgYnkgbGFuZ3VhZ2Vcblx0XHRjb25zdCBsaW5lQ29tbWVudFRva2VuID1cblx0XHRcdGxhbmd1YWdlSWQgPT09ICdweXRob24nID8gJyMnIDpcblx0XHRcdFx0bGFuZ3VhZ2VJZCA9PT0gJ2phdmFzY3JpcHQnIHx8IGxhbmd1YWdlSWQgPT09ICd0eXBlc2NyaXB0JyA/ICcvLycgOlxuXHRcdFx0XHRcdG51bGw7XG5cblx0XHRjb25zdCBibG9ja0NvbW1lbnRzID1cblx0XHRcdChsYW5ndWFnZUlkID09PSAnamF2YXNjcmlwdCcgfHwgbGFuZ3VhZ2VJZCA9PT0gJ3R5cGVzY3JpcHQnKSA/IHsgc3RhcnQ6ICcvKicsIGVuZDogJyovJyB9IDpcblx0XHRcdFx0bnVsbDtcblxuXHRcdGxldCBpbkJsb2NrQ29tbWVudCA9IGZhbHNlO1xuXHRcdGxldCBibG9ja0NvbW1lbnRTdGFydExpbmUgPSAtMTtcblx0XHRsZXQgYmxvY2tDb21tZW50U3RhcnRDb2wgPSAtMTtcblxuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSAwOyBsaW5lTnVtYmVyIDwgbGluZXMubGVuZ3RoOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tsaW5lTnVtYmVyXTtcblx0XHRcdGNvbnN0IHRyaW1tZWRMaW5lID0gbGluZS50cmltKCk7XG5cblx0XHRcdC8vIFNraXAgZW1wdHkgbGluZXNcblx0XHRcdGlmICh0cmltbWVkTGluZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChibG9ja0NvbW1lbnRzKSB7XG5cdFx0XHRcdGlmICghaW5CbG9ja0NvbW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCBzdGFydEluZGV4ID0gbGluZS5pbmRleE9mKGJsb2NrQ29tbWVudHMuc3RhcnQpO1xuXHRcdFx0XHRcdGlmIChzdGFydEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0aW5CbG9ja0NvbW1lbnQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YmxvY2tDb21tZW50U3RhcnRMaW5lID0gbGluZU51bWJlcjtcblx0XHRcdFx0XHRcdGJsb2NrQ29tbWVudFN0YXJ0Q29sID0gc3RhcnRJbmRleDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaW5CbG9ja0NvbW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCBlbmRJbmRleCA9IGxpbmUuaW5kZXhPZihibG9ja0NvbW1lbnRzLmVuZCk7XG5cdFx0XHRcdFx0aWYgKGVuZEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0Y29tbWVudFJhbmdlcy5wdXNoKG5ldyBSYW5nZShcblx0XHRcdFx0XHRcdFx0YmxvY2tDb21tZW50U3RhcnRMaW5lICsgMSxcblx0XHRcdFx0XHRcdFx0YmxvY2tDb21tZW50U3RhcnRDb2wgKyAxLFxuXHRcdFx0XHRcdFx0XHRsaW5lTnVtYmVyICsgMSxcblx0XHRcdFx0XHRcdFx0ZW5kSW5kZXggKyBibG9ja0NvbW1lbnRzLmVuZC5sZW5ndGggKyAxXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdGluQmxvY2tDb21tZW50ID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaW5CbG9ja0NvbW1lbnQgJiYgbGluZUNvbW1lbnRUb2tlbiAmJiBsaW5lLnRyaW1MZWZ0KCkuc3RhcnRzV2l0aChsaW5lQ29tbWVudFRva2VuKSkge1xuXHRcdFx0XHRjb25zdCBzdGFydENvbCA9IGxpbmUuaW5kZXhPZihsaW5lQ29tbWVudFRva2VuKTtcblx0XHRcdFx0Y29tbWVudFJhbmdlcy5wdXNoKG5ldyBSYW5nZShcblx0XHRcdFx0XHRsaW5lTnVtYmVyICsgMSxcblx0XHRcdFx0XHRzdGFydENvbCArIDEsXG5cdFx0XHRcdFx0bGluZU51bWJlciArIDEsXG5cdFx0XHRcdFx0bGluZS5sZW5ndGggKyAxXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBibG9jayBjb21tZW50IGF0IGVuZCBvZiBmaWxlXG5cdFx0aWYgKGluQmxvY2tDb21tZW50KSB7XG5cdFx0XHRjb21tZW50UmFuZ2VzLnB1c2gobmV3IFJhbmdlKFxuXHRcdFx0XHRibG9ja0NvbW1lbnRTdGFydExpbmUgKyAxLFxuXHRcdFx0XHRibG9ja0NvbW1lbnRTdGFydENvbCArIDEsXG5cdFx0XHRcdGxpbmVzLmxlbmd0aCxcblx0XHRcdFx0bGluZXNbbGluZXMubGVuZ3RoIC0gMV0ubGVuZ3RoICsgMVxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbW1lbnRSYW5nZXM7XG5cdH1cblxuXHRwcml2YXRlIGlzUG9zaXRpb25JblJhbmdlcyhwb3NpdGlvbjogUG9zaXRpb24sIHJhbmdlczogUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiByYW5nZXMuc29tZShyYW5nZSA9PiByYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNlbGxJbmxpbmVEZWNvcmF0aW9ucyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdKSB7XG5cdFx0Y29uc3Qgb2xkRGVjb3JhdGlvbnMgPSB0aGlzLmNlbGxEZWNvcmF0aW9uSWRzLmdldChjZWxsKSA/PyBbXTtcblx0XHR0aGlzLmNlbGxEZWNvcmF0aW9uSWRzLnNldChjZWxsLCBjZWxsLmRlbHRhTW9kZWxEZWNvcmF0aW9ucyhcblx0XHRcdG9sZERlY29yYXRpb25zLFxuXHRcdFx0ZGVjb3JhdGlvbnNcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdENlbGxDb250ZW50TGlzdGVuZXIoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBjZWxsTW9kZWwgPSBjZWxsLnRleHRNb2RlbDtcblx0XHRpZiAoIWNlbGxNb2RlbCkge1xuXHRcdFx0cmV0dXJuOyAvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdH1cblxuXHRcdC8vIENsZWFyIGRlY29yYXRpb25zIG9uIGNvbnRlbnQgY2hhbmdlXG5cdFx0dGhpcy5jZWxsQ29udGVudExpc3RlbmVycy5zZXQoY2VsbC51cmksIGNlbGxNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5jbGVhckNlbGxJbmxpbmVEZWNvcmF0aW9ucyhjZWxsKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyQ2VsbElubGluZURlY29yYXRpb25zKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0Y29uc3QgY2VsbERlY29yYXRpb25zID0gdGhpcy5jZWxsRGVjb3JhdGlvbklkcy5nZXQoY2VsbCkgPz8gW107XG5cdFx0aWYgKGNlbGxEZWNvcmF0aW9ucykge1xuXHRcdFx0Y2VsbC5kZWx0YU1vZGVsRGVjb3JhdGlvbnMoY2VsbERlY29yYXRpb25zLCBbXSk7XG5cdFx0XHR0aGlzLmNlbGxEZWNvcmF0aW9uSWRzLmRlbGV0ZShjZWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IHRoaXMuY2VsbENvbnRlbnRMaXN0ZW5lcnMuZ2V0KGNlbGwudXJpKTtcblx0XHRpZiAobGlzdGVuZXIpIHtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuY2VsbENvbnRlbnRMaXN0ZW5lcnMuZGVsZXRlKGNlbGwudXJpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhck5vdGVib29rSW5saW5lRGVjb3JhdGlvbnMoKSB7XG5cdFx0dGhpcy5jZWxsRGVjb3JhdGlvbklkcy5mb3JFYWNoKChfLCBjZWxsKSA9PiB7XG5cdFx0XHR0aGlzLmNsZWFyQ2VsbElubGluZURlY29yYXRpb25zKGNlbGwpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGNsZWFyTm90ZWJvb2tJbmxpbmVEZWNvcmF0aW9ucygpIHtcblx0XHR0aGlzLl9jbGVhck5vdGVib29rSW5saW5lRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NsZWFyTm90ZWJvb2tJbmxpbmVEZWNvcmF0aW9ucygpO1xuXHRcdHRoaXMuY3VycmVudENhbmNlbGxhdGlvblRva2VuU291cmNlcy5mb3JFYWNoKHNvdXJjZSA9PiBzb3VyY2UuY2FuY2VsKCkpO1xuXHRcdHRoaXMuY3VycmVudENhbmNlbGxhdGlvblRva2VuU291cmNlcy5jbGVhcigpO1xuXHRcdHRoaXMuY2VsbENvbnRlbnRMaXN0ZW5lcnMuZm9yRWFjaChsaXN0ZW5lciA9PiBsaXN0ZW5lci5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuY2VsbENvbnRlbnRMaXN0ZW5lcnMuY2xlYXIoKTtcblx0fVxufVxuXG5yZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uKE5vdGVib29rSW5saW5lVmFyaWFibGVzQ29udHJvbGxlci5pZCwgTm90ZWJvb2tJbmxpbmVWYXJpYWJsZXNDb250cm9sbGVyKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsZWFyTm90ZWJvb2tJbmxpbmVWYWx1ZXMgZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2suY2xlYXJBbGxJbmxpbmVWYWx1ZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjbGVhckFsbElubGluZVZhbHVlcycsICdDbGVhciBBbGwgSW5saW5lIFZhbHVlcycpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rSW5saW5lVmFyaWFibGVzQ29udHJvbGxlcj4oTm90ZWJvb2tJbmxpbmVWYXJpYWJsZXNDb250cm9sbGVyLmlkKTtcblx0XHRjb250cm9sbGVyLmNsZWFyTm90ZWJvb2tJbmxpbmVEZWNvcmF0aW9ucygpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBR2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsZUFBZSxhQUFhO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQTBDLGdDQUFnQyw2QkFBNkI7QUFDdkcsU0FBUyw4QkFBK0M7QUFDeEQsU0FBaUMsc0JBQXNCO0FBRXZELFNBQVMsb0NBQW9DO0FBRTdDLE1BQU0sY0FBYztBQUFBLEVBQ25CLFlBQW1CLFFBQXVCLE1BQWM7QUFBckM7QUFBdUI7QUFBQSxFQUMxQztBQUNEO0FBRU8sSUFBTSxvQ0FBTixjQUFnRCxXQUFrRDtBQUFBO0FBQUEsRUFXeEcsWUFDa0IsZ0JBQ3dCLHVCQUNRLCtCQUNOLHlCQUNILHNCQUNSLGNBQy9CO0FBQ0QsVUFBTTtBQVBXO0FBQ3dCO0FBQ1E7QUFDTjtBQUNIO0FBQ1I7QUFiakMsU0FBUSxvQkFBb0Isb0JBQUksSUFBOEI7QUFDOUQsU0FBUSx1QkFBdUIsSUFBSSxZQUF5QjtBQUU1RCxTQUFRLGtDQUFrQyxJQUFJLFlBQXFDO0FBY2xGLFNBQUssVUFBVSxLQUFLLDhCQUE4QixxQkFBcUIsT0FBTSxNQUFLO0FBQ2pGLFlBQU0sc0JBQXNCLEtBQUsscUJBQXFCLFNB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
