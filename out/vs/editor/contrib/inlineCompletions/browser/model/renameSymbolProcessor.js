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
import { raceTimeout } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { LcsDiff, StringDiffSequence } from "../../../../../base/common/diff/diff.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../browser/services/bulkEditService.js";
import { TextReplacement } from "../../../../common/core/edits/textEdit.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { StandardTokenType } from "../../../../common/encodedTokenAttributes.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { EditSources } from "../../../../common/textModelEditSource.js";
import { hasProvider, rawRename } from "../../../rename/browser/rename.js";
import { renameSymbolCommandId } from "../controller/commandIds.js";
import { InlineSuggestionItem } from "./inlineSuggestionItem.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { IRenameSymbolTrackerService } from "../../../../browser/services/renameSymbolTrackerService.js";
import { ICodeEditorService } from "../../../../browser/services/codeEditorService.js";
import { TextModelValueReference } from "./textModelValueReference.js";
var RenameKind = /* @__PURE__ */ ((RenameKind2) => {
  RenameKind2["no"] = "no";
  RenameKind2["yes"] = "yes";
  RenameKind2["maybe"] = "maybe";
  return RenameKind2;
})(RenameKind || {});
((RenameKind2) => {
  function fromString(value) {
    switch (value) {
      case "no":
        return "no" /* no */;
      case "yes":
        return "yes" /* yes */;
      case "maybe":
        return "maybe" /* maybe */;
      default:
        return "no" /* no */;
    }
  }
  RenameKind2.fromString = fromString;
})(RenameKind || (RenameKind = {}));
class RenameInferenceEngine {
  constructor() {
  }
  inferRename(textModel, editRange, insertText, wordDefinition) {
    const extendedRange = new Range(editRange.startLineNumber, 1, editRange.endLineNumber, textModel.getLineMaxColumn(editRange.endLineNumber));
    const startDiff = editRange.startColumn - extendedRange.startColumn;
    const endDiff = extendedRange.endColumn - editRange.endColumn;
    const originalText = textModel.getValueInRange(extendedRange);
    const modifiedText = textModel.getValueInRange(new Range(extendedRange.startLineNumber, extendedRange.startColumn, extendedRange.startLineNumber, extendedRange.startColumn + startDiff)) + insertText + textModel.getValueInRange(new Range(extendedRange.endLineNumber, extendedRange.endColumn - endDiff, extendedRange.endLineNumber, extendedRange.endColumn));
    const others = [];
    const renames = [];
    let oldName = void 0;
    let newName = void 0;
    let position = void 0;
    const nesOffset = textModel.getOffsetAt(extendedRange.getStartPosition());
    const { changes: originalChanges } = new LcsDiff(new StringDiffSequence(originalText), new StringDiffSequence(modifiedText)).ComputeDiff(true);
    if (originalChanges.length === 0) {
      return void 0;
    }
    const changes = [];
    for (const change of originalChanges) {
      if (changes.length === 0) {
        changes.push(change);
        continue;
      }
      const lastChange = changes[changes.length - 1];
      const gapOriginalLength = change.originalStart - (lastChange.originalStart + lastChange.originalLength);
      if (gapOriginalLength > 0) {
        const gapStartOffset = nesOffset + lastChange.originalStart + lastChange.originalLength;
        const gapStartPos = textModel.getPositionAt(gapStartOffset);
        const wordRange = textModel.getWordAtPosition(gapStartPos);
        if (wordRange) {
          const wordStartOffset = textModel.getOffsetAt(new Position(gapStartPos.lineNumber, wordRange.startColumn));
          const wordEndOffset = textModel.getOffsetAt(new Position(gapStartPos.lineNumber, wordRange.endColumn));
          const gapEndOffset = gapStartOffset + gapOriginalLength;
          if (wordStartOffset <= gapStartOffset && gapEndOffset <= wordEndOffset && wordStartOffset <= gapEndOffset && gapEndOffset <= wordEndOffset) {
            lastChange.originalLength = change.originalStart + change.originalLength - lastChange.originalStart;
            lastChange.modifiedLength = change.modifiedStart + change.modifiedLength - lastChange.modifiedStart;
            continue;
          }
        }
      }
      changes.push(change);
    }
    let tokenDiff = 0;
    for (const change of changes) {
      const originalTextSegment = originalText.substring(change.originalStart, change.originalStart + change.originalLength);
      const insertedTextSegment = modifiedText.substring(change.modifiedStart, change.modifiedStart + change.modifiedLength);
      const startOffset = nesOffset + change.originalStart;
      const startPos = textModel.getPositionAt(startOffset);
      const endOffset = startOffset + change.originalLength;
      const endPos = textModel.getPositionAt(endOffset);
      const range = Range.fromPositions(startPos, endPos);
      const diff = insertedTextSegment.length - change.originalLength;
      if (/\s/.test(originalTextSegment)) {
        others.push(new TextReplacement(range, insertedTextSegment));
        tokenDiff += diff;
        continue;
      }
      if (originalTextSegment.length > 0) {
        wordDefinition.lastIndex = 0;
        const match2 = wordDefinition.exec(originalTextSegment);
        if (match2 === null || match2.index !== 0 || match2[0].length !== originalTextSegment.length) {
          others.push(new TextReplacement(range, insertedTextSegment));
          tokenDiff += diff;
          continue;
        }
      }
      if (/\s/.test(insertedTextSegment)) {
        others.push(new TextReplacement(range, insertedTextSegment));
        tokenDiff += diff;
        continue;
      }
      if (insertedTextSegment.length > 0) {
        wordDefinition.lastIndex = 0;
        const match2 = wordDefinition.exec(insertedTextSegment);
        if (match2 === null || match2.index !== 0 || match2[0].length !== insertedTextSegment.length) {
          others.push(new TextReplacement(range, insertedTextSegment));
          tokenDiff += diff;
          continue;
        }
      }
      const wordRange = textModel.getWordAtPosition(startPos);
      if (wordRange === null) {
        others.push(new TextReplacement(range, insertedTextSegment));
        tokenDiff += diff;
        continue;
      }
      const originalStartColumn = change.originalStart + 1;
      const isInsertion = change.originalLength === 0 && change.modifiedLength > 0;
      let tokenInfo;
      if (isInsertion && originalStartColumn === wordRange.endColumn && wordRange.endColumn > wordRange.startColumn) {
        tokenInfo = this.getTokenAtPosition(textModel, new Position(startPos.lineNumber, wordRange.startColumn));
      } else {
        tokenInfo = this.getTokenAtPosition(textModel, startPos);
      }
      if (wordRange.startColumn !== tokenInfo.range.startColumn || wordRange.endColumn !== tokenInfo.range.endColumn) {
        others.push(new TextReplacement(range, insertedTextSegment));
        tokenDiff += diff;
        continue;
      }
      if (tokenInfo.type === StandardTokenType.Other) {
        let identifier = textModel.getValueInRange(tokenInfo.range);
        if (identifier.length === 0) {
          others.push(new TextReplacement(range, insertedTextSegment));
          tokenDiff += diff;
          continue;
        }
        if (oldName === void 0) {
          oldName = identifier;
        } else if (oldName !== identifier) {
          others.push(new TextReplacement(range, insertedTextSegment));
          tokenDiff += diff;
          continue;
        }
        const tokenStartPos = textModel.getOffsetAt(tokenInfo.range.getStartPosition()) - nesOffset + tokenDiff;
        const tokenEndPos = textModel.getOffsetAt(tokenInfo.range.getEndPosition()) - nesOffset + tokenDiff;
        identifier = modifiedText.substring(tokenStartPos, tokenEndPos + diff);
        if (identifier.length === 0) {
          others.push(new TextReplacement(range, insertedTextSegment));
          tokenDiff += diff;
          continue;
        }
        if (newName === void 0) {
          newName = identifier;
        } else if (newName !== identifier) {
          others.push(new TextReplacement(range, insertedTextSegment));
          tokenDiff += diff;
          continue;
        }
        if (position === void 0) {
          position = tokenInfo.range.getStartPosition();
        }
        if (oldName !== void 0 && newName !== void 0 && oldName.length > 0 && newName.length > 0 && oldName !== newName) {
          renames.push(new TextReplacement(tokenInfo.range, newName));
        } else {
          renames.push(new TextReplacement(range, insertedTextSegment));
        }
        tokenDiff += diff;
      } else {
        others.push(new TextReplacement(range, insertedTextSegment));
        tokenDiff += insertedTextSegment.length - change.originalLength;
      }
    }
    if (oldName === void 0 || newName === void 0 || position === void 0 || oldName.length === 0 || newName.length === 0 || oldName === newName) {
      return void 0;
    }
    wordDefinition.lastIndex = 0;
    let match = wordDefinition.exec(oldName);
    if (match === null || match.index !== 0 || match[0].length !== oldName.length) {
      return void 0;
    }
    wordDefinition.lastIndex = 0;
    match = wordDefinition.exec(newName);
    if (match === null || match.index !== 0 || match[0].length !== newName.length) {
      return void 0;
    }
    return {
      renames: { edits: renames, position, oldName, newName },
      others: { edits: others }
    };
  }
  getTokenAtPosition(textModel, position) {
    textModel.tokenization.tokenizeIfCheap(position.lineNumber);
    const tokens = textModel.tokenization.getLineTokens(position.lineNumber);
    const idx = tokens.findTokenIndexAtOffset(position.column - 1);
    return {
      type: tokens.getStandardTokenType(idx),
      range: new Range(position.lineNumber, 1 + tokens.getStartOffset(idx), position.lineNumber, 1 + tokens.getEndOffset(idx))
    };
  }
}
class EditorState {
  constructor(editor, versionId) {
    this.editor = editor;
    this.versionId = versionId;
  }
  static create(codeEditorService, textModel) {
    const editor = codeEditorService.getFocusedCodeEditor();
    if (editor === null) {
      return void 0;
    }
    if (editor.getModel() !== textModel) {
      return void 0;
    }
    return new EditorState(editor, textModel.getVersionId());
  }
  equals(other) {
    if (other === void 0) {
      return false;
    }
    return this.editor === other.editor && this.versionId === other.versionId;
  }
}
class RenameSymbolRunnable {
  constructor(languageFeaturesService, commandService, requestUuid, textModel, state, position, newName, lastSymbolRename, oldName) {
    this._result = void 0;
    this._commandService = commandService;
    this._textModel = textModel;
    this._state = state;
    this._requestUuid = requestUuid;
    this._cancellationTokenSource = new CancellationTokenSource();
    if (lastSymbolRename === void 0 || oldName === void 0) {
      this._promise = rawRename(languageFeaturesService.renameProvider, textModel, position, newName, this._cancellationTokenSource.token);
      return;
    } else {
      this._promise = this.sendNesRenameRequest(textModel, position, oldName, newName, lastSymbolRename);
    }
  }
  get requestUuid() {
    return this._requestUuid;
  }
  isValid(codeEditorService) {
    return this._state.equals(EditorState.create(codeEditorService, this._textModel));
  }
  cancel() {
    this._cancellationTokenSource.cancel();
  }
  async getCount() {
    if (this._cancellationTokenSource.token.isCancellationRequested) {
      return 0;
    }
    const result = await this.getResult();
    if (result === void 0 || this._cancellationTokenSource.token.isCancellationRequested) {
      return 0;
    }
    return result.edits.length;
  }
  async getWorkspaceEdit() {
    return this.getResult();
  }
  async getResult() {
    if (this._cancellationTokenSource.token.isCancellationRequested) {
      return void 0;
    }
    if (this._result === void 0) {
      this._result = await this._promise;
    }
    if (this._result.rejectReason || this._cancellationTokenSource.token.isCancellationRequested) {
      return void 0;
    }
    return this._result;
  }
  async sendNesRenameRequest(textModel, position, oldName, newName, lastSymbolRename) {
    try {
      const result = await this._commandService.executeCommand("github.copilot.nes.postRename", textModel.uri, position, oldName, newName, lastSymbolRename);
      if (result === void 0) {
        return { rejectReason: "Rename failed", edits: [] };
      }
      const edits = [];
      for (const item of result) {
        for (const change of item.changes) {
          const range = new Range(change.range.start.line + 1, change.range.start.character + 1, change.range.end.line + 1, change.range.end.character + 1);
          const edit = new ResourceTextEdit(item.file, new TextReplacement(range, change.newText ?? newName));
          edits.push(edit);
        }
      }
      return { edits };
    } catch (error) {
      return { rejectReason: "Rename failed", edits: [] };
    }
  }
}
let RenameSymbolProcessor = class extends Disposable {
  constructor(_commandService, _languageFeaturesService, _languageConfigurationService, bulkEditService, _renameSymbolTrackerService, _codeEditorService) {
    super();
    this._commandService = _commandService;
    this._languageFeaturesService = _languageFeaturesService;
    this._languageConfigurationService = _languageConfigurationService;
    this._renameSymbolTrackerService = _renameSymbolTrackerService;
    this._codeEditorService = _codeEditorService;
    this._renameInferenceEngine = new RenameInferenceEngine();
    this._renameRunnable = void 0;
    this._register(CommandsRegistry.registerCommand(renameSymbolCommandId, async (_, source, renameRunnable) => {
      if (renameRunnable === void 0 || !renameRunnable.isValid(this._codeEditorService)) {
        return;
      }
      try {
        const workspaceEdit = await renameRunnable.getWorkspaceEdit();
        if (workspaceEdit === void 0) {
          return;
        }
        bulkEditService.apply(workspaceEdit, { reason: source });
      } finally {
        if (this._renameRunnable === renameRunnable) {
          this._renameRunnable = void 0;
        }
      }
    }));
  }
  async proposeRenameRefactoring(textModel, suggestItem, context) {
    if (!suggestItem.supportsRename || suggestItem.action?.kind !== "edit" || context.selectedSuggestionInfo) {
      return suggestItem;
    }
    if (!hasProvider(this._languageFeaturesService.renameProvider, textModel)) {
      return suggestItem;
    }
    const state = EditorState.create(this._codeEditorService, textModel);
    if (state === void 0) {
      return suggestItem;
    }
    const start = Date.now();
    const edit = suggestItem.action.textReplacement;
    const languageConfiguration = this._languageConfigurationService.getLanguageConfiguration(textModel.getLanguageId());
    const edits = this._renameInferenceEngine.inferRename(textModel, edit.range, edit.text, languageConfiguration.wordDefinition);
    if (edits === void 0 || edits.renames.edits.length === 0) {
      return suggestItem;
    }
    const { oldName, newName, position, edits: renameEdits } = edits.renames;
    const trackedWord = this._renameSymbolTrackerService.trackedWord.get();
    let lastSymbolRename = void 0;
    if (trackedWord !== void 0 && trackedWord.model === textModel && trackedWord.originalWord === oldName && trackedWord.currentWord === newName) {
      lastSymbolRename = trackedWord.currentRange;
    }
    let timedOut = false;
    const check = await raceTimeout(this.checkRenamePrecondition(suggestItem, textModel, position, oldName, newName, lastSymbolRename), 100, () => {
      timedOut = true;
    });
    const renamePossible = this.isRenamePossible(suggestItem, check, state, textModel);
    suggestItem.setRenameProcessingInfo({
      createdRename: renamePossible,
      duration: Date.now() - start,
      timedOut,
      droppedOtherEdits: renamePossible ? edits.others.edits.length : void 0,
      droppedRenameEdits: renamePossible ? renameEdits.length - 1 : void 0
    });
    if (!renamePossible) {
      return suggestItem;
    }
    if (this._renameRunnable === void 0) {
      this._renameRunnable = new RenameSymbolRunnable(this._languageFeaturesService, this._commandService, suggestItem.requestUuid, textModel, state, position, newName, lastSymbolRename, lastSymbolRename !== void 0 ? oldName : void 0);
    }
    const source = EditSources.inlineCompletionAccept({
      nes: suggestItem.isInlineEdit,
      requestUuid: suggestItem.requestUuid,
      providerId: suggestItem.source.provider.providerId,
      languageId: textModel.getLanguageId(),
      correlationId: suggestItem.getSourceCompletion().correlationId
    });
    const command = {
      id: renameSymbolCommandId,
      title: localize("rename", "Rename"),
      arguments: [source, this._renameRunnable]
    };
    const alternativeAction = {
      label: localize("rename", "Rename"),
      icon: Codicon.replaceAll,
      command,
      count: this._renameRunnable.getCount()
    };
    const renameAction = {
      kind: "edit",
      range: renameEdits[0].range,
      insertText: renameEdits[0].text,
      snippetInfo: suggestItem.snippetInfo,
      alternativeAction,
      uri: textModel.uri
    };
    const ref = TextModelValueReference.snapshot(textModel);
    return InlineSuggestionItem.create(suggestItem.withAction(renameAction), ref, false);
  }
  async checkRenamePrecondition(suggestItem, textModel, position, oldName, newName, lastSymbolRename) {
    const no = { canRename: "no" /* no */, timedOut: false };
    try {
      const result = await this._commandService.executeCommand("github.copilot.nes.prepareRename", textModel.uri, position, oldName, newName, suggestItem.requestUuid, lastSymbolRename);
      if (result === void 0) {
        return no;
      } else if (typeof result === "string") {
        const canRename = RenameKind.fromString(result);
        if (canRename === "yes" /* yes */ || canRename === "maybe" /* maybe */) {
          return {
            canRename,
            oldName,
            onOldState: false
          };
        } else {
          return {
            canRename,
            timedOut: false
          };
        }
      } else {
        return result;
      }
    } catch (error) {
      return no;
    }
  }
  isRenamePossible(suggestItem, check, state, textModel) {
    if (check === void 0 || check.canRename === "no" /* no */) {
      return false;
    }
    if (!state.equals(EditorState.create(this._codeEditorService, textModel))) {
      return false;
    }
    if (this._renameRunnable === void 0) {
      return true;
    }
    if (this._renameRunnable.requestUuid === suggestItem.requestUuid) {
      return false;
    } else {
      this._renameRunnable.cancel();
      this._renameRunnable = void 0;
      return true;
    }
  }
};
RenameSymbolProcessor = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, ILanguageConfigurationService),
  __decorateParam(3, IBulkEditService),
  __decorateParam(4, IRenameSymbolTrackerService),
  __decorateParam(5, ICodeEditorService)
], RenameSymbolProcessor);
export {
  RenameInferenceEngine,
  RenameSymbolProcessor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxtb2RlbFxccmVuYW1lU3ltYm9sUHJvY2Vzc29yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBMY3NEaWZmLCBTdHJpbmdEaWZmU2VxdWVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kaWZmL2RpZmYuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGV4dFJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSwgdHlwZSBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IENvbW1hbmQsIHR5cGUgUmVqZWN0aW9uLCB0eXBlIFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzLCBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgaGFzUHJvdmlkZXIsIHJhd1JlbmFtZSB9IGZyb20gJy4uLy4uLy4uL3JlbmFtZS9icm93c2VyL3JlbmFtZS5qcyc7XG5pbXBvcnQgeyByZW5hbWVTeW1ib2xDb21tYW5kSWQgfSBmcm9tICcuLi9jb250cm9sbGVyL2NvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbkl0ZW0gfSBmcm9tICcuL2lubGluZVN1Z2dlc3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElJbmxpbmVTdWdnZXN0RGF0YUFjdGlvbkVkaXQsIElubGluZUNvbXBsZXRpb25Db250ZXh0V2l0aG91dFV1aWQgfSBmcm9tICcuL3Byb3ZpZGVJbmxpbmVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24gfSBmcm9tICcuL0lubGluZVN1Z2dlc3RBbHRlcm5hdGl2ZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSVJlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9yZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UgfSBmcm9tICcuL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLmpzJztcblxuZW51bSBSZW5hbWVLaW5kIHtcblx0bm8gPSAnbm8nLFxuXHR5ZXMgPSAneWVzJyxcblx0bWF5YmUgPSAnbWF5YmUnXG59XG5cbm5hbWVzcGFjZSBSZW5hbWVLaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TdHJpbmcodmFsdWU6IHN0cmluZyk6IFJlbmFtZUtpbmQge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgJ25vJzogcmV0dXJuIFJlbmFtZUtpbmQubm87XG5cdFx0XHRjYXNlICd5ZXMnOiByZXR1cm4gUmVuYW1lS2luZC55ZXM7XG5cdFx0XHRjYXNlICdtYXliZSc6IHJldHVybiBSZW5hbWVLaW5kLm1heWJlO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIFJlbmFtZUtpbmQubm87XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUHJlcGFyZU5lc1JlbmFtZVJlc3VsdCB7XG5cdGV4cG9ydCB0eXBlIFllcyA9IHtcblx0XHRjYW5SZW5hbWU6IFJlbmFtZUtpbmQueWVzO1xuXHRcdG9sZE5hbWU6IHN0cmluZztcblx0XHRvbk9sZFN0YXRlOiBib29sZWFuO1xuXHR9O1xuXHRleHBvcnQgdHlwZSBNYXliZSA9IHtcblx0XHRjYW5SZW5hbWU6IFJlbmFtZUtpbmQubWF5YmU7XG5cdFx0b2xkTmFtZTogc3RyaW5nO1xuXHRcdG9uT2xkU3RhdGU6IGJvb2xlYW47XG5cdH07XG5cdGV4cG9ydCB0eXBlIE5vID0ge1xuXHRcdGNhblJlbmFtZTogUmVuYW1lS2luZC5ubztcblx0XHR0aW1lZE91dDogYm9vbGVhbjtcblx0XHRyZWFzb24/OiBzdHJpbmc7XG5cdH07XG59XG5cbmV4cG9ydCB0eXBlIFByZXBhcmVOZXNSZW5hbWVSZXN1bHQgPSBQcmVwYXJlTmVzUmVuYW1lUmVzdWx0LlllcyB8IFByZXBhcmVOZXNSZW5hbWVSZXN1bHQuTWF5YmUgfCBQcmVwYXJlTmVzUmVuYW1lUmVzdWx0Lk5vO1xuXG5leHBvcnQgdHlwZSBUZXh0Q2hhbmdlID0ge1xuXHRyYW5nZTogeyBzdGFydDogeyBsaW5lOiBudW1iZXI7IGNoYXJhY3RlcjogbnVtYmVyIH07IGVuZDogeyBsaW5lOiBudW1iZXI7IGNoYXJhY3RlcjogbnVtYmVyIH0gfTtcblx0bmV3VGV4dD86IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIFJlbmFtZUdyb3VwID0ge1xuXHRmaWxlOiBVUkk7XG5cdGNoYW5nZXM6IFRleHRDaGFuZ2VbXTtcbn07XG5cbmV4cG9ydCB0eXBlIFJlbmFtZUVkaXRzID0ge1xuXHRyZW5hbWVzOiB7IGVkaXRzOiBUZXh0UmVwbGFjZW1lbnRbXTsgcG9zaXRpb246IFBvc2l0aW9uOyBvbGROYW1lOiBzdHJpbmc7IG5ld05hbWU6IHN0cmluZyB9O1xuXHRvdGhlcnM6IHsgZWRpdHM6IFRleHRSZXBsYWNlbWVudFtdIH07XG59O1xuXG5leHBvcnQgY2xhc3MgUmVuYW1lSW5mZXJlbmNlRW5naW5lIHtcblxuXHRwdWJsaWMgY29uc3RydWN0b3IoKSB7XG5cdH1cblxuXHRwdWJsaWMgaW5mZXJSZW5hbWUodGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBlZGl0UmFuZ2U6IFJhbmdlLCBpbnNlcnRUZXh0OiBzdHJpbmcsIHdvcmREZWZpbml0aW9uOiBSZWdFeHApOiBSZW5hbWVFZGl0cyB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBFeHRlbmQgdGhlIGVkaXQgcmFuZ2UgdG8gZnVsbCBsaW5lcyB0byBjYXB0dXJlIHByZWZpeC9zdWZmaXggcmVuYW1lc1xuXHRcdGNvbnN0IGV4dGVuZGVkUmFuZ2UgPSBuZXcgUmFuZ2UoZWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSwgZWRpdFJhbmdlLmVuZExpbmVOdW1iZXIsIHRleHRNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGVkaXRSYW5nZS5lbmRMaW5lTnVtYmVyKSk7XG5cdFx0Y29uc3Qgc3RhcnREaWZmID0gZWRpdFJhbmdlLnN0YXJ0Q29sdW1uIC0gZXh0ZW5kZWRSYW5nZS5zdGFydENvbHVtbjtcblx0XHRjb25zdCBlbmREaWZmID0gZXh0ZW5kZWRSYW5nZS5lbmRDb2x1bW4gLSBlZGl0UmFuZ2UuZW5kQ29sdW1uO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxUZXh0ID0gdGV4dE1vZGVsLmdldFZhbHVlSW5SYW5nZShleHRlbmRlZFJhbmdlKTtcblx0XHRjb25zdCBtb2RpZmllZFRleHQgPVxuXHRcdFx0dGV4dE1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoZXh0ZW5kZWRSYW5nZS5zdGFydExpbmVOdW1iZXIsIGV4dGVuZGVkUmFuZ2Uuc3RhcnRDb2x1bW4sIGV4dGVuZGVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBleHRlbmRlZFJhbmdlLnN0YXJ0Q29sdW1uICsgc3RhcnREaWZmKSkgK1xuXHRcdFx0aW5zZXJ0VGV4dCArXG5cdFx0XHR0ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShleHRlbmRlZFJhbmdlLmVuZExpbmVOdW1iZXIsIGV4dGVuZGVkUmFuZ2UuZW5kQ29sdW1uIC0gZW5kRGlmZiwgZXh0ZW5kZWRSYW5nZS5lbmRMaW5lTnVtYmVyLCBleHRlbmRlZFJhbmdlLmVuZENvbHVtbikpO1xuXG5cdFx0Ly8gY29uc29sZS5sb2coYE9yaWdpbmFsOiAke29yaWdpbmFsVGV4dH0gXFxubW9kaWZpZWQ6ICR7bW9kaWZpZWRUZXh0fWApO1xuXHRcdGNvbnN0IG90aGVyczogVGV4dFJlcGxhY2VtZW50W10gPSBbXTtcblx0XHRjb25zdCByZW5hbWVzOiBUZXh0UmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGxldCBvbGROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IG5ld05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgcG9zaXRpb246IFBvc2l0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbmVzT2Zmc2V0ID0gdGV4dE1vZGVsLmdldE9mZnNldEF0KGV4dGVuZGVkUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblxuXHRcdGNvbnN0IHsgY2hhbmdlczogb3JpZ2luYWxDaGFuZ2VzIH0gPSAobmV3IExjc0RpZmYobmV3IFN0cmluZ0RpZmZTZXF1ZW5jZShvcmlnaW5hbFRleHQpLCBuZXcgU3RyaW5nRGlmZlNlcXVlbmNlKG1vZGlmaWVkVGV4dCkpKS5Db21wdXRlRGlmZih0cnVlKTtcblx0XHRpZiAob3JpZ2luYWxDaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBGb2xkIHRoZSBjaGFuZ2VzIHRvIGxhcmdlciBjaGFuZ2VzIGlmIHRoZSBnYXAgYmV0d2VlbiB0d28gY2hhbmdlcyBpcyBhIGZ1bGwgd29yZC4gVGhpcyBjb3ZlcnMgY2FzZXMgbGlrZSByZW5hbWluZ1xuXHRcdC8vIGBmb29gIHRvIGBhYmNmb29iYXJgXG5cdFx0Y29uc3QgY2hhbmdlczogdHlwZW9mIG9yaWdpbmFsQ2hhbmdlcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIG9yaWdpbmFsQ2hhbmdlcykge1xuXHRcdFx0aWYgKGNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNoYW5nZXMucHVzaChjaGFuZ2UpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFzdENoYW5nZSA9IGNoYW5nZXNbY2hhbmdlcy5sZW5ndGggLSAxXTtcblx0XHRcdGNvbnN0IGdhcE9yaWdpbmFsTGVuZ3RoID0gY2hhbmdlLm9yaWdpbmFsU3RhcnQgLSAobGFzdENoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgbGFzdENoYW5nZS5vcmlnaW5hbExlbmd0aCk7XG5cblx0XHRcdGlmIChnYXBPcmlnaW5hbExlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZ2FwU3RhcnRPZmZzZXQgPSBuZXNPZmZzZXQgKyBsYXN0Q2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBsYXN0Q2hhbmdlLm9yaWdpbmFsTGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBnYXBTdGFydFBvcyA9IHRleHRNb2RlbC5nZXRQb3NpdGlvbkF0KGdhcFN0YXJ0T2Zmc2V0KTtcblx0XHRcdFx0Y29uc3Qgd29yZFJhbmdlID0gdGV4dE1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKGdhcFN0YXJ0UG9zKTtcblxuXHRcdFx0XHRpZiAod29yZFJhbmdlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29yZFN0YXJ0T2Zmc2V0ID0gdGV4dE1vZGVsLmdldE9mZnNldEF0KG5ldyBQb3NpdGlvbihnYXBTdGFydFBvcy5saW5lTnVtYmVyLCB3b3JkUmFuZ2Uuc3RhcnRDb2x1bW4pKTtcblx0XHRcdFx0XHRjb25zdCB3b3JkRW5kT2Zmc2V0ID0gdGV4dE1vZGVsLmdldE9mZnNldEF0KG5ldyBQb3NpdGlvbihnYXBTdGFydFBvcy5saW5lTnVtYmVyLCB3b3JkUmFuZ2UuZW5kQ29sdW1uKSk7XG5cdFx0XHRcdFx0Y29uc3QgZ2FwRW5kT2Zmc2V0ID0gZ2FwU3RhcnRPZmZzZXQgKyBnYXBPcmlnaW5hbExlbmd0aDtcblxuXHRcdFx0XHRcdGlmICh3b3JkU3RhcnRPZmZzZXQgPD0gZ2FwU3RhcnRPZmZzZXQgJiYgZ2FwRW5kT2Zmc2V0IDw9IHdvcmRFbmRPZmZzZXQgJiYgd29yZFN0YXJ0T2Zmc2V0IDw9IGdhcEVuZE9mZnNldCAmJiBnYXBFbmRPZmZzZXQgPD0gd29yZEVuZE9mZnNldCkge1xuXHRcdFx0XHRcdFx0bGFzdENoYW5nZS5vcmlnaW5hbExlbmd0aCA9IChjaGFuZ2Uub3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCkgLSBsYXN0Q2hhbmdlLm9yaWdpbmFsU3RhcnQ7XG5cdFx0XHRcdFx0XHRsYXN0Q2hhbmdlLm1vZGlmaWVkTGVuZ3RoID0gKGNoYW5nZS5tb2RpZmllZFN0YXJ0ICsgY2hhbmdlLm1vZGlmaWVkTGVuZ3RoKSAtIGxhc3RDaGFuZ2UubW9kaWZpZWRTdGFydDtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjaGFuZ2VzLnB1c2goY2hhbmdlKTtcblx0XHR9XG5cblx0XHRsZXQgdG9rZW5EaWZmOiBudW1iZXIgPSAwO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVGV4dFNlZ21lbnQgPSBvcmlnaW5hbFRleHQuc3Vic3RyaW5nKGNoYW5nZS5vcmlnaW5hbFN0YXJ0LCBjaGFuZ2Uub3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCk7XG5cdFx0XHRjb25zdCBpbnNlcnRlZFRleHRTZWdtZW50ID0gbW9kaWZpZWRUZXh0LnN1YnN0cmluZyhjaGFuZ2UubW9kaWZpZWRTdGFydCwgY2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBjaGFuZ2UubW9kaWZpZWRMZW5ndGgpO1xuXG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IG5lc09mZnNldCArIGNoYW5nZS5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0Y29uc3Qgc3RhcnRQb3MgPSB0ZXh0TW9kZWwuZ2V0UG9zaXRpb25BdChzdGFydE9mZnNldCk7XG5cblx0XHRcdGNvbnN0IGVuZE9mZnNldCA9IHN0YXJ0T2Zmc2V0ICsgY2hhbmdlLm9yaWdpbmFsTGVuZ3RoO1xuXHRcdFx0Y29uc3QgZW5kUG9zID0gdGV4dE1vZGVsLmdldFBvc2l0aW9uQXQoZW5kT2Zmc2V0KTtcblxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXJ0UG9zLCBlbmRQb3MpO1xuXG5cdFx0XHRjb25zdCBkaWZmID0gaW5zZXJ0ZWRUZXh0U2VnbWVudC5sZW5ndGggLSBjaGFuZ2Uub3JpZ2luYWxMZW5ndGg7XG5cblx0XHRcdC8vIElmIHRoZSBvcmlnaW5hbCB0ZXh0IHNlZ21lbnQgY29udGFpbnMgYSB3aGl0ZXNwYWNlIGNoYXJhY3RlciB3ZSBkb24ndCBjb25zaWRlciB0aGlzIGEgcmVuYW1lIHNpbmNlXG5cdFx0XHQvLyBpZGVudGlmaWVycyBpbiBwcm9ncmFtbWluZyBsYW5ndWFnZXMgY2FuJ3QgY29udGFpbiB3aGl0ZXNwYWNlIGNoYXJhY3RlcnMgdXN1YWxseVxuXHRcdFx0aWYgKC9cXHMvLnRlc3Qob3JpZ2luYWxUZXh0U2VnbWVudCkpIHtcblx0XHRcdFx0b3RoZXJzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgaW5zZXJ0ZWRUZXh0U2VnbWVudCkpO1xuXHRcdFx0XHR0b2tlbkRpZmYgKz0gZGlmZjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3JpZ2luYWxUZXh0U2VnbWVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHdvcmREZWZpbml0aW9uLmxhc3RJbmRleCA9IDA7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gd29yZERlZmluaXRpb24uZXhlYyhvcmlnaW5hbFRleHRTZWdtZW50KTtcblx0XHRcdFx0aWYgKG1hdGNoID09PSBudWxsIHx8IG1hdGNoLmluZGV4ICE9PSAwIHx8IG1hdGNoWzBdLmxlbmd0aCAhPT0gb3JpZ2luYWxUZXh0U2VnbWVudC5sZW5ndGgpIHtcblx0XHRcdFx0XHRvdGhlcnMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBpbnNlcnRlZFRleHRTZWdtZW50KSk7XG5cdFx0XHRcdFx0dG9rZW5EaWZmICs9IGRpZmY7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIElmIHRoZSBpbnNlcnRlZCB0ZXh0IGNvbnRhaW5zIGEgd2hpdGVzcGFjZSBjaGFyYWN0ZXIgd2UgZG9uJ3QgY29uc2lkZXIgdGhpcyBhIHJlbmFtZSBzaW5jZSBpZGVudGlmaWVycyBpblxuXHRcdFx0Ly8gcHJvZ3JhbW1pbmcgbGFuZ3VhZ2VzIGNhbid0IGNvbnRhaW4gd2hpdGVzcGFjZSBjaGFyYWN0ZXJzIHVzdWFsbHlcblx0XHRcdGlmICgvXFxzLy50ZXN0KGluc2VydGVkVGV4dFNlZ21lbnQpKSB7XG5cdFx0XHRcdG90aGVycy5wdXNoKG5ldyBUZXh0UmVwbGFjZW1lbnQocmFuZ2UsIGluc2VydGVkVGV4dFNlZ21lbnQpKTtcblx0XHRcdFx0dG9rZW5EaWZmICs9IGRpZmY7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluc2VydGVkVGV4dFNlZ21lbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR3b3JkRGVmaW5pdGlvbi5sYXN0SW5kZXggPSAwO1xuXHRcdFx0XHRjb25zdCBtYXRjaCA9IHdvcmREZWZpbml0aW9uLmV4ZWMoaW5zZXJ0ZWRUZXh0U2VnbWVudCk7XG5cdFx0XHRcdGlmIChtYXRjaCA9PT0gbnVsbCB8fCBtYXRjaC5pbmRleCAhPT0gMCB8fCBtYXRjaFswXS5sZW5ndGggIT09IGluc2VydGVkVGV4dFNlZ21lbnQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0b3RoZXJzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgaW5zZXJ0ZWRUZXh0U2VnbWVudCkpO1xuXHRcdFx0XHRcdHRva2VuRGlmZiArPSBkaWZmO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmRSYW5nZSA9IHRleHRNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihzdGFydFBvcyk7XG5cdFx0XHQvLyBJZiB3ZSBkb24ndCBoYXZlIGEgd29yZCByYW5nZSBhdCB0aGUgc3RhcnQgcG9zaXRpb24gb2YgdGhlIGN1cnJlbnQgZG9jdW1lbnQgdGhlbiB3ZVxuXHRcdFx0Ly8gZG9uJ3QgdHJlYXQgaXQgYXMgYSByZW5hbWUgYXNzdW1pbmcgdGhhdCB0aGUgcmVuYW1lIHJlZmFjdG9yaW5nIHdpbGwgZmFpbCBhcyB3ZWxsIHNpbmNlXG5cdFx0XHQvLyB0aGVyZSBjYW4ndCBiZSBhbiBpZGVudGlmaWVyIGF0IHRoYXQgcG9zaXRpb24uXG5cdFx0XHRpZiAod29yZFJhbmdlID09PSBudWxsKSB7XG5cdFx0XHRcdG90aGVycy5wdXNoKG5ldyBUZXh0UmVwbGFjZW1lbnQocmFuZ2UsIGluc2VydGVkVGV4dFNlZ21lbnQpKTtcblx0XHRcdFx0dG9rZW5EaWZmICs9IGRpZmY7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTdGFydENvbHVtbiA9IGNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgMTtcblx0XHRcdGNvbnN0IGlzSW5zZXJ0aW9uID0gY2hhbmdlLm9yaWdpbmFsTGVuZ3RoID09PSAwICYmIGNoYW5nZS5tb2RpZmllZExlbmd0aCA+IDA7XG5cdFx0XHRsZXQgdG9rZW5JbmZvOiB7IHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlOyByYW5nZTogUmFuZ2UgfTtcblx0XHRcdC8vIFdvcmQgaW5mbyBpcyBsZWZ0IGFsaWduZWQgd2hlcmVhcyB0b2tlbiBpbmZvIGlzIHJpZ2h0IGFsaWduZWQgZm9yIGluc2VydGlvbnMuXG5cdFx0XHQvLyBXZSBwcmVmZXIgYSBzdWZmaXggaW5zZXJ0aW9uIGZvciByZW5hbWVzIHNvIHdlIHRha2UgdGhlIHdvcmQgcmFuZ2UgZm9yIHRoZSB0b2tlbiBpbmZvLlxuXHRcdFx0aWYgKGlzSW5zZXJ0aW9uICYmIG9yaWdpbmFsU3RhcnRDb2x1bW4gPT09IHdvcmRSYW5nZS5lbmRDb2x1bW4gJiYgd29yZFJhbmdlLmVuZENvbHVtbiA+IHdvcmRSYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0XHR0b2tlbkluZm8gPSB0aGlzLmdldFRva2VuQXRQb3NpdGlvbih0ZXh0TW9kZWwsIG5ldyBQb3NpdGlvbihzdGFydFBvcy5saW5lTnVtYmVyLCB3b3JkUmFuZ2Uuc3RhcnRDb2x1bW4pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRva2VuSW5mbyA9IHRoaXMuZ2V0VG9rZW5BdFBvc2l0aW9uKHRleHRNb2RlbCwgc3RhcnRQb3MpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdvcmRSYW5nZS5zdGFydENvbHVtbiAhPT0gdG9rZW5JbmZvLnJhbmdlLnN0YXJ0Q29sdW1uIHx8IHdvcmRSYW5nZS5lbmRDb2x1bW4gIT09IHRva2VuSW5mby5yYW5nZS5lbmRDb2x1bW4pIHtcblx0XHRcdFx0b3RoZXJzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgaW5zZXJ0ZWRUZXh0U2VnbWVudCkpO1xuXHRcdFx0XHR0b2tlbkRpZmYgKz0gZGlmZjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9rZW5JbmZvLnR5cGUgPT09IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyKSB7XG5cblx0XHRcdFx0bGV0IGlkZW50aWZpZXIgPSB0ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKHRva2VuSW5mby5yYW5nZSk7XG5cdFx0XHRcdGlmIChpZGVudGlmaWVyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdG90aGVycy5wdXNoKG5ldyBUZXh0UmVwbGFjZW1lbnQocmFuZ2UsIGluc2VydGVkVGV4dFNlZ21lbnQpKTtcblx0XHRcdFx0XHR0b2tlbkRpZmYgKz0gZGlmZjtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob2xkTmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0b2xkTmFtZSA9IGlkZW50aWZpZXI7XG5cdFx0XHRcdH0gZWxzZSBpZiAob2xkTmFtZSAhPT0gaWRlbnRpZmllcikge1xuXHRcdFx0XHRcdG90aGVycy5wdXNoKG5ldyBUZXh0UmVwbGFjZW1lbnQocmFuZ2UsIGluc2VydGVkVGV4dFNlZ21lbnQpKTtcblx0XHRcdFx0XHR0b2tlbkRpZmYgKz0gZGlmZjtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdlIGFzc3VtZSB0aGF0IHRoZSBuZXcgbmFtZSBzdGFydHMgYXQgdGhlIHNhbWUgcG9zaXRpb24gYXMgdGhlIG9sZCBuYW1lIGZyb20gYSB0b2tlbiByYW5nZSBwZXJzcGVjdGl2ZS5cblx0XHRcdFx0Y29uc3QgdG9rZW5TdGFydFBvcyA9IHRleHRNb2RlbC5nZXRPZmZzZXRBdCh0b2tlbkluZm8ucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSAtIG5lc09mZnNldCArIHRva2VuRGlmZjtcblx0XHRcdFx0Y29uc3QgdG9rZW5FbmRQb3MgPSB0ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQodG9rZW5JbmZvLnJhbmdlLmdldEVuZFBvc2l0aW9uKCkpIC0gbmVzT2Zmc2V0ICsgdG9rZW5EaWZmO1xuXHRcdFx0XHRpZGVudGlmaWVyID0gbW9kaWZpZWRUZXh0LnN1YnN0cmluZyh0b2tlblN0YXJ0UG9zLCB0b2tlbkVuZFBvcyArIGRpZmYpO1xuXHRcdFx0XHRpZiAoaWRlbnRpZmllci5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRvdGhlcnMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBpbnNlcnRlZFRleHRTZWdtZW50KSk7XG5cdFx0XHRcdFx0dG9rZW5EaWZmICs9IGRpZmY7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5ld05hbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG5ld05hbWUgPSBpZGVudGlmaWVyO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5ld05hbWUgIT09IGlkZW50aWZpZXIpIHtcblx0XHRcdFx0XHRvdGhlcnMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBpbnNlcnRlZFRleHRTZWdtZW50KSk7XG5cdFx0XHRcdFx0dG9rZW5EaWZmICs9IGRpZmY7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocG9zaXRpb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHBvc2l0aW9uID0gdG9rZW5JbmZvLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChvbGROYW1lICE9PSB1bmRlZmluZWQgJiYgbmV3TmFtZSAhPT0gdW5kZWZpbmVkICYmIG9sZE5hbWUubGVuZ3RoID4gMCAmJiBuZXdOYW1lLmxlbmd0aCA+IDAgJiYgb2xkTmFtZSAhPT0gbmV3TmFtZSkge1xuXHRcdFx0XHRcdHJlbmFtZXMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KHRva2VuSW5mby5yYW5nZSwgbmV3TmFtZSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlbmFtZXMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBpbnNlcnRlZFRleHRTZWdtZW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9rZW5EaWZmICs9IGRpZmY7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdGhlcnMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBpbnNlcnRlZFRleHRTZWdtZW50KSk7XG5cdFx0XHRcdHRva2VuRGlmZiArPSBpbnNlcnRlZFRleHRTZWdtZW50Lmxlbmd0aCAtIGNoYW5nZS5vcmlnaW5hbExlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAob2xkTmFtZSA9PT0gdW5kZWZpbmVkIHx8IG5ld05hbWUgPT09IHVuZGVmaW5lZCB8fCBwb3NpdGlvbiA9PT0gdW5kZWZpbmVkIHx8IG9sZE5hbWUubGVuZ3RoID09PSAwIHx8IG5ld05hbWUubGVuZ3RoID09PSAwIHx8IG9sZE5hbWUgPT09IG5ld05hbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0d29yZERlZmluaXRpb24ubGFzdEluZGV4ID0gMDtcblx0XHRsZXQgbWF0Y2ggPSB3b3JkRGVmaW5pdGlvbi5leGVjKG9sZE5hbWUpO1xuXHRcdGlmIChtYXRjaCA9PT0gbnVsbCB8fCBtYXRjaC5pbmRleCAhPT0gMCB8fCBtYXRjaFswXS5sZW5ndGggIT09IG9sZE5hbWUubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHdvcmREZWZpbml0aW9uLmxhc3RJbmRleCA9IDA7XG5cdFx0bWF0Y2ggPSB3b3JkRGVmaW5pdGlvbi5leGVjKG5ld05hbWUpO1xuXHRcdGlmIChtYXRjaCA9PT0gbnVsbCB8fCBtYXRjaC5pbmRleCAhPT0gMCB8fCBtYXRjaFswXS5sZW5ndGggIT09IG5ld05hbWUubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZW5hbWVzOiB7IGVkaXRzOiByZW5hbWVzLCBwb3NpdGlvbiwgb2xkTmFtZSwgbmV3TmFtZSB9LFxuXHRcdFx0b3RoZXJzOiB7IGVkaXRzOiBvdGhlcnMgfVxuXHRcdH07XG5cdH1cblxuXG5cdHByb3RlY3RlZCBnZXRUb2tlbkF0UG9zaXRpb24odGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pOiB7IHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlOyByYW5nZTogUmFuZ2UgfSB7XG5cdFx0dGV4dE1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUlmQ2hlYXAocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGlkeCA9IHRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiB0b2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUoaWR4KSxcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgMSArIHRva2Vucy5nZXRTdGFydE9mZnNldChpZHgpLCBwb3NpdGlvbi5saW5lTnVtYmVyLCAxICsgdG9rZW5zLmdldEVuZE9mZnNldChpZHgpKVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgRWRpdG9yU3RhdGUge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsIHRleHRNb2RlbDogSVRleHRNb2RlbCk6IEVkaXRvclN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpO1xuXHRcdGlmIChlZGl0b3IgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvci5nZXRNb2RlbCgpICE9PSB0ZXh0TW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBFZGl0b3JTdGF0ZShlZGl0b3IsIHRleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZlcnNpb25JZDogbnVtYmVyLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IEVkaXRvclN0YXRlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yID09PSBvdGhlci5lZGl0b3IgJiYgdGhpcy52ZXJzaW9uSWQgPT09IG90aGVyLnZlcnNpb25JZDtcblx0fVxufVxuXG5jbGFzcyBSZW5hbWVTeW1ib2xSdW5uYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdFV1aWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsOiBJVGV4dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogRWRpdG9yU3RhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbWlzZTogUHJvbWlzZTxXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uPjtcblx0cHJpdmF0ZSBfcmVzdWx0OiBXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsIHJlcXVlc3RVdWlkOiBzdHJpbmcsIHRleHRNb2RlbDogSVRleHRNb2RlbCwgc3RhdGU6IEVkaXRvclN0YXRlLCBwb3NpdGlvbjogUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZywgbGFzdFN5bWJvbFJlbmFtZTogSVJhbmdlIHwgdW5kZWZpbmVkLCBvbGROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jb21tYW5kU2VydmljZSA9IGNvbW1hbmRTZXJ2aWNlO1xuXHRcdHRoaXMuX3RleHRNb2RlbCA9IHRleHRNb2RlbDtcblx0XHR0aGlzLl9zdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX3JlcXVlc3RVdWlkID0gcmVxdWVzdFV1aWQ7XG5cdFx0dGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRpZiAobGFzdFN5bWJvbFJlbmFtZSA9PT0gdW5kZWZpbmVkIHx8IG9sZE5hbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcHJvbWlzZSA9IHJhd1JlbmFtZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlciwgdGV4dE1vZGVsLCBwb3NpdGlvbiwgbmV3TmFtZSwgdGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wcm9taXNlID0gdGhpcy5zZW5kTmVzUmVuYW1lUmVxdWVzdCh0ZXh0TW9kZWwsIHBvc2l0aW9uLCBvbGROYW1lLCBuZXdOYW1lLCBsYXN0U3ltYm9sUmVuYW1lKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJlcXVlc3RVdWlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVlc3RVdWlkO1xuXHR9XG5cblx0cHVibGljIGlzVmFsaWQoY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZS5lcXVhbHMoRWRpdG9yU3RhdGUuY3JlYXRlKGNvZGVFZGl0b3JTZXJ2aWNlLCB0aGlzLl90ZXh0TW9kZWwpKTtcblx0fVxuXG5cdHB1YmxpYyBjYW5jZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0Q291bnQoKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRpZiAodGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdldFJlc3VsdCgpO1xuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCB8fCB0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5lZGl0cy5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0V29ya3NwYWNlRWRpdCgpOiBQcm9taXNlPFdvcmtzcGFjZUVkaXQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRSZXN1bHQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UmVzdWx0KCk6IFByb21pc2U8V29ya3NwYWNlRWRpdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Jlc3VsdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm9taXNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcmVzdWx0LnJlamVjdFJlYXNvbiB8fCB0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VuZE5lc1JlbmFtZVJlcXVlc3QodGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIG9sZE5hbWU6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nLCBsYXN0U3ltYm9sUmVuYW1lOiBJUmFuZ2UgfCB1bmRlZmluZWQpOiBQcm9taXNlPFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8UmVuYW1lR3JvdXBbXT4oJ2dpdGh1Yi5jb3BpbG90Lm5lcy5wb3N0UmVuYW1lJywgdGV4dE1vZGVsLnVyaSwgcG9zaXRpb24sIG9sZE5hbWUsIG5ld05hbWUsIGxhc3RTeW1ib2xSZW5hbWUpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7IHJlamVjdFJlYXNvbjogJ1JlbmFtZSBmYWlsZWQnLCBlZGl0czogW10gfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRzOiBSZXNvdXJjZVRleHRFZGl0W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiByZXN1bHQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgaXRlbS5jaGFuZ2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoY2hhbmdlLnJhbmdlLnN0YXJ0LmxpbmUgKyAxLCBjaGFuZ2UucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyICsgMSwgY2hhbmdlLnJhbmdlLmVuZC5saW5lICsgMSwgY2hhbmdlLnJhbmdlLmVuZC5jaGFyYWN0ZXIgKyAxKTtcblx0XHRcdFx0XHRjb25zdCBlZGl0ID0gbmV3IFJlc291cmNlVGV4dEVkaXQoaXRlbS5maWxlLCBuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBjaGFuZ2UubmV3VGV4dCA/PyBuZXdOYW1lKSk7XG5cdFx0XHRcdFx0ZWRpdHMucHVzaChlZGl0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgZWRpdHMgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIHsgcmVqZWN0UmVhc29uOiAnUmVuYW1lIGZhaWxlZCcsIGVkaXRzOiBbXSB9O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVuYW1lU3ltYm9sUHJvY2Vzc29yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuYW1lSW5mZXJlbmNlRW5naW5lID0gbmV3IFJlbmFtZUluZmVyZW5jZUVuZ2luZSgpO1xuXG5cdHByaXZhdGUgX3JlbmFtZVJ1bm5hYmxlOiBSZW5hbWVTeW1ib2xSdW5uYWJsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBidWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZTogSVJlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChyZW5hbWVTeW1ib2xDb21tYW5kSWQsIGFzeW5jIChfOiBTZXJ2aWNlc0FjY2Vzc29yLCBzb3VyY2U6IFRleHRNb2RlbEVkaXRTb3VyY2UsIHJlbmFtZVJ1bm5hYmxlOiBSZW5hbWVTeW1ib2xSdW5uYWJsZSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKHJlbmFtZVJ1bm5hYmxlID09PSB1bmRlZmluZWQgfHwgIXJlbmFtZVJ1bm5hYmxlLmlzVmFsaWQodGhpcy5fY29kZUVkaXRvclNlcnZpY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRWRpdCA9IGF3YWl0IHJlbmFtZVJ1bm5hYmxlLmdldFdvcmtzcGFjZUVkaXQoKTtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZUVkaXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRidWxrRWRpdFNlcnZpY2UuYXBwbHkod29ya3NwYWNlRWRpdCwgeyByZWFzb246IHNvdXJjZSB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmICh0aGlzLl9yZW5hbWVSdW5uYWJsZSA9PT0gcmVuYW1lUnVubmFibGUpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW5hbWVSdW5uYWJsZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwcm9wb3NlUmVuYW1lUmVmYWN0b3JpbmcodGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBzdWdnZXN0SXRlbTogSW5saW5lU3VnZ2VzdGlvbkl0ZW0sIGNvbnRleHQ6IElubGluZUNvbXBsZXRpb25Db250ZXh0V2l0aG91dFV1aWQpOiBQcm9taXNlPElubGluZVN1Z2dlc3Rpb25JdGVtPiB7XG5cdFx0aWYgKCFzdWdnZXN0SXRlbS5zdXBwb3J0c1JlbmFtZSB8fCBzdWdnZXN0SXRlbS5hY3Rpb24/LmtpbmQgIT09ICdlZGl0JyB8fCBjb250ZXh0LnNlbGVjdGVkU3VnZ2VzdGlvbkluZm8pIHtcblx0XHRcdHJldHVybiBzdWdnZXN0SXRlbTtcblx0XHR9XG5cblx0XHRpZiAoIWhhc1Byb3ZpZGVyKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLCB0ZXh0TW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4gc3VnZ2VzdEl0ZW07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSBFZGl0b3JTdGF0ZS5jcmVhdGUodGhpcy5fY29kZUVkaXRvclNlcnZpY2UsIHRleHRNb2RlbCk7XG5cdFx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBzdWdnZXN0SXRlbTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgZWRpdCA9IHN1Z2dlc3RJdGVtLmFjdGlvbi50ZXh0UmVwbGFjZW1lbnQ7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uID0gdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24odGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cblx0XHQvLyBDaGVjayBzeW5jaHJvbm91c2x5IGlmIGEgcmVuYW1lIGlzIHBvc3NpYmxlXG5cdFx0Y29uc3QgZWRpdHMgPSB0aGlzLl9yZW5hbWVJbmZlcmVuY2VFbmdpbmUuaW5mZXJSZW5hbWUodGV4dE1vZGVsLCBlZGl0LnJhbmdlLCBlZGl0LnRleHQsIGxhbmd1YWdlQ29uZmlndXJhdGlvbi53b3JkRGVmaW5pdGlvbik7XG5cdFx0aWYgKGVkaXRzID09PSB1bmRlZmluZWQgfHwgZWRpdHMucmVuYW1lcy5lZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBzdWdnZXN0SXRlbTtcblx0XHR9XG5cblx0XHRjb25zdCB7IG9sZE5hbWUsIG5ld05hbWUsIHBvc2l0aW9uLCBlZGl0czogcmVuYW1lRWRpdHMgfSA9IGVkaXRzLnJlbmFtZXM7XG5cblx0XHRjb25zdCB0cmFja2VkV29yZCA9IHRoaXMuX3JlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlLnRyYWNrZWRXb3JkLmdldCgpO1xuXHRcdGxldCBsYXN0U3ltYm9sUmVuYW1lOiBJUmFuZ2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRyYWNrZWRXb3JkICE9PSB1bmRlZmluZWQgJiYgdHJhY2tlZFdvcmQubW9kZWwgPT09IHRleHRNb2RlbCAmJiB0cmFja2VkV29yZC5vcmlnaW5hbFdvcmQgPT09IG9sZE5hbWUgJiYgdHJhY2tlZFdvcmQuY3VycmVudFdvcmQgPT09IG5ld05hbWUpIHtcblx0XHRcdGxhc3RTeW1ib2xSZW5hbWUgPSB0cmFja2VkV29yZC5jdXJyZW50UmFuZ2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgYXN5bmNocm9ub3VzbHkgaWYgYSByZW5hbWUgaXMgcG9zc2libGVcblx0XHRsZXQgdGltZWRPdXQgPSBmYWxzZTtcblx0XHRjb25zdCBjaGVjayA9IGF3YWl0IHJhY2VUaW1lb3V0PFByZXBhcmVOZXNSZW5hbWVSZXN1bHQ+KHRoaXMuY2hlY2tSZW5hbWVQcmVjb25kaXRpb24oc3VnZ2VzdEl0ZW0sIHRleHRNb2RlbCwgcG9zaXRpb24sIG9sZE5hbWUsIG5ld05hbWUsIGxhc3RTeW1ib2xSZW5hbWUpLCAxMDAsICgpID0+IHsgdGltZWRPdXQgPSB0cnVlOyB9KTtcblx0XHRjb25zdCByZW5hbWVQb3NzaWJsZSA9IHRoaXMuaXNSZW5hbWVQb3NzaWJsZShzdWdnZXN0SXRlbSwgY2hlY2ssIHN0YXRlLCB0ZXh0TW9kZWwpO1xuXG5cdFx0c3VnZ2VzdEl0ZW0uc2V0UmVuYW1lUHJvY2Vzc2luZ0luZm8oe1xuXHRcdFx0Y3JlYXRlZFJlbmFtZTogcmVuYW1lUG9zc2libGUsXG5cdFx0XHRkdXJhdGlvbjogRGF0ZS5ub3coKSAtIHN0YXJ0LFxuXHRcdFx0dGltZWRPdXQsXG5cdFx0XHRkcm9wcGVkT3RoZXJFZGl0czogcmVuYW1lUG9zc2libGUgPyBlZGl0cy5vdGhlcnMuZWRpdHMubGVuZ3RoIDogdW5kZWZpbmVkLFxuXHRcdFx0ZHJvcHBlZFJlbmFtZUVkaXRzOiByZW5hbWVQb3NzaWJsZSA/IHJlbmFtZUVkaXRzLmxlbmd0aCAtIDEgOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlbmFtZVBvc3NpYmxlKSB7XG5cdFx0XHRyZXR1cm4gc3VnZ2VzdEl0ZW07XG5cdFx0fVxuXG5cdFx0Ly8gUHJlcGFyZSB0aGUgcmVuYW1lIGVkaXRzXG5cdFx0aWYgKHRoaXMuX3JlbmFtZVJ1bm5hYmxlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3JlbmFtZVJ1bm5hYmxlID0gbmV3IFJlbmFtZVN5bWJvbFJ1bm5hYmxlKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCB0aGlzLl9jb21tYW5kU2VydmljZSwgc3VnZ2VzdEl0ZW0ucmVxdWVzdFV1aWQsIHRleHRNb2RlbCwgc3RhdGUsIHBvc2l0aW9uLCBuZXdOYW1lLCBsYXN0U3ltYm9sUmVuYW1lLCBsYXN0U3ltYm9sUmVuYW1lICE9PSB1bmRlZmluZWQgPyBvbGROYW1lIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYWx0ZXJuYXRpdmUgYWN0aW9uXG5cdFx0Y29uc3Qgc291cmNlID0gRWRpdFNvdXJjZXMuaW5saW5lQ29tcGxldGlvbkFjY2VwdCh7XG5cdFx0XHRuZXM6IHN1Z2dlc3RJdGVtLmlzSW5saW5lRWRpdCxcblx0XHRcdHJlcXVlc3RVdWlkOiBzdWdnZXN0SXRlbS5yZXF1ZXN0VXVpZCxcblx0XHRcdHByb3ZpZGVySWQ6IHN1Z2dlc3RJdGVtLnNvdXJjZS5wcm92aWRlci5wcm92aWRlcklkLFxuXHRcdFx0bGFuZ3VhZ2VJZDogdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdGNvcnJlbGF0aW9uSWQ6IHN1Z2dlc3RJdGVtLmdldFNvdXJjZUNvbXBsZXRpb24oKS5jb3JyZWxhdGlvbklkLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbW1hbmQ6IENvbW1hbmQgPSB7XG5cdFx0XHRpZDogcmVuYW1lU3ltYm9sQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZW5hbWUnLCBcIlJlbmFtZVwiKSxcblx0XHRcdGFyZ3VtZW50czogW3NvdXJjZSwgdGhpcy5fcmVuYW1lUnVubmFibGVdLFxuXHRcdH07XG5cdFx0Y29uc3QgYWx0ZXJuYXRpdmVBY3Rpb246IElubGluZVN1Z2dlc3RBbHRlcm5hdGl2ZUFjdGlvbiA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVuYW1lJywgXCJSZW5hbWVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnJlcGxhY2VBbGwsXG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0Y291bnQ6IHRoaXMuX3JlbmFtZVJ1bm5hYmxlLmdldENvdW50KCksXG5cdFx0fTtcblx0XHRjb25zdCByZW5hbWVBY3Rpb246IElJbmxpbmVTdWdnZXN0RGF0YUFjdGlvbkVkaXQgPSB7XG5cdFx0XHRraW5kOiAnZWRpdCcsXG5cdFx0XHRyYW5nZTogcmVuYW1lRWRpdHNbMF0ucmFuZ2UsXG5cdFx0XHRpbnNlcnRUZXh0OiByZW5hbWVFZGl0c1swXS50ZXh0LFxuXHRcdFx0c25pcHBldEluZm86IHN1Z2dlc3RJdGVtLnNuaXBwZXRJbmZvLFxuXHRcdFx0YWx0ZXJuYXRpdmVBY3Rpb24sXG5cdFx0XHR1cmk6IHRleHRNb2RlbC51cmlcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmID0gVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2Uuc25hcHNob3QodGV4dE1vZGVsKTtcblx0XHRyZXR1cm4gSW5saW5lU3VnZ2VzdGlvbkl0ZW0uY3JlYXRlKHN1Z2dlc3RJdGVtLndpdGhBY3Rpb24ocmVuYW1lQWN0aW9uKSwgcmVmLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrUmVuYW1lUHJlY29uZGl0aW9uKHN1Z2dlc3RJdGVtOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIG9sZE5hbWU6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nLCBsYXN0U3ltYm9sUmVuYW1lOiBJUmFuZ2UgfCB1bmRlZmluZWQpOiBQcm9taXNlPFByZXBhcmVOZXNSZW5hbWVSZXN1bHQ+IHtcblx0XHRjb25zdCBubzogUHJlcGFyZU5lc1JlbmFtZVJlc3VsdC5ObyA9IHsgY2FuUmVuYW1lOiBSZW5hbWVLaW5kLm5vLCB0aW1lZE91dDogZmFsc2UgfTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8UmVuYW1lS2luZCB8IFByZXBhcmVOZXNSZW5hbWVSZXN1bHQ+KCdnaXRodWIuY29waWxvdC5uZXMucHJlcGFyZVJlbmFtZScsIHRleHRNb2RlbC51cmksIHBvc2l0aW9uLCBvbGROYW1lLCBuZXdOYW1lLCBzdWdnZXN0SXRlbS5yZXF1ZXN0VXVpZCwgbGFzdFN5bWJvbFJlbmFtZSk7XG5cdFx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIG5vO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBjYW5SZW5hbWUgPSBSZW5hbWVLaW5kLmZyb21TdHJpbmcocmVzdWx0KTtcblx0XHRcdFx0aWYgKGNhblJlbmFtZSA9PT0gUmVuYW1lS2luZC55ZXMgfHwgY2FuUmVuYW1lID09PSBSZW5hbWVLaW5kLm1heWJlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNhblJlbmFtZSxcblx0XHRcdFx0XHRcdG9sZE5hbWUsXG5cdFx0XHRcdFx0XHRvbk9sZFN0YXRlOiBmYWxzZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRjYW5SZW5hbWUsXG5cdFx0XHRcdFx0XHR0aW1lZE91dDogZmFsc2UsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIG5vO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNSZW5hbWVQb3NzaWJsZShzdWdnZXN0SXRlbTogSW5saW5lU3VnZ2VzdGlvbkl0ZW0sIGNoZWNrOiBQcmVwYXJlTmVzUmVuYW1lUmVzdWx0IHwgdW5kZWZpbmVkLCBzdGF0ZTogRWRpdG9yU3RhdGUsIHRleHRNb2RlbDogSVRleHRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGlmIChjaGVjayA9PT0gdW5kZWZpbmVkIHx8IGNoZWNrLmNhblJlbmFtZSA9PT0gUmVuYW1lS2luZC5ubykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXN0YXRlLmVxdWFscyhFZGl0b3JTdGF0ZS5jcmVhdGUodGhpcy5fY29kZUVkaXRvclNlcnZpY2UsIHRleHRNb2RlbCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZW5hbWVSdW5uYWJsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3JlbmFtZVJ1bm5hYmxlLnJlcXVlc3RVdWlkID09PSBzdWdnZXN0SXRlbS5yZXF1ZXN0VXVpZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZW5hbWVSdW5uYWJsZS5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3JlbmFtZVJ1bm5hYmxlID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsU0FBUywwQkFBMEI7QUFDNUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0IsdUJBQXVCO0FBRWxELFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUJBQXdDO0FBQ2pELFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFHckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUNBQW1DO0FBRzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStCO0FBRXhDLElBQUssYUFBTCxrQkFBS0EsZ0JBQUw7QUFDQyxFQUFBQSxZQUFBLFFBQUs7QUFDTCxFQUFBQSxZQUFBLFNBQU07QUFDTixF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
