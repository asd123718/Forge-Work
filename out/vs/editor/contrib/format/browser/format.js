import { asArray, isNonEmptyArray } from "../../../../base/common/arrays.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource, TextModelCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { isCodeEditor } from "../../../browser/editorBrowser.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { IEditorWorkerService } from "../../../common/services/editorWorker.js";
import { ITextModelService } from "../../../common/services/resolverService.js";
import { FormattingEdit } from "./formattingEdit.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ExtensionIdentifierSet } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
function getRealAndSyntheticDocumentFormattersOrdered(documentFormattingEditProvider, documentRangeFormattingEditProvider, model) {
  const result = [];
  const seen = new ExtensionIdentifierSet();
  const docFormatter = documentFormattingEditProvider.ordered(model);
  for (const formatter of docFormatter) {
    result.push(formatter);
    if (formatter.extensionId) {
      seen.add(formatter.extensionId);
    }
  }
  const rangeFormatter = documentRangeFormattingEditProvider.ordered(model);
  for (const formatter of rangeFormatter) {
    if (formatter.extensionId) {
      if (seen.has(formatter.extensionId)) {
        continue;
      }
      seen.add(formatter.extensionId);
    }
    result.push({
      displayName: formatter.displayName,
      extensionId: formatter.extensionId,
      provideDocumentFormattingEdits(model2, options, token) {
        return formatter.provideDocumentRangeFormattingEdits(model2, model2.getFullModelRange(), options, token);
      }
    });
  }
  return result;
}
var FormattingKind = /* @__PURE__ */ ((FormattingKind2) => {
  FormattingKind2[FormattingKind2["File"] = 1] = "File";
  FormattingKind2[FormattingKind2["Selection"] = 2] = "Selection";
  return FormattingKind2;
})(FormattingKind || {});
var FormattingMode = /* @__PURE__ */ ((FormattingMode2) => {
  FormattingMode2[FormattingMode2["Explicit"] = 1] = "Explicit";
  FormattingMode2[FormattingMode2["Silent"] = 2] = "Silent";
  return FormattingMode2;
})(FormattingMode || {});
const _FormattingConflicts = class _FormattingConflicts {
  static setFormatterSelector(selector) {
    const remove = _FormattingConflicts._selectors.unshift(selector);
    return { dispose: remove };
  }
  static async select(formatter, document, mode, kind) {
    if (formatter.length === 0) {
      return void 0;
    }
    const selector = Iterable.first(_FormattingConflicts._selectors);
    if (selector) {
      return await selector(formatter, document, mode, kind);
    }
    return void 0;
  }
};
_FormattingConflicts._selectors = new LinkedList();
let FormattingConflicts = _FormattingConflicts;
async function formatDocumentRangesWithSelectedProvider(accessor, editorOrModel, rangeOrRanges, mode, progress, token, userGesture) {
  const instaService = accessor.get(IInstantiationService);
  const { documentRangeFormattingEditProvider: documentRangeFormattingEditProviderRegistry } = accessor.get(ILanguageFeaturesService);
  const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
  const provider = documentRangeFormattingEditProviderRegistry.ordered(model);
  const selected = await FormattingConflicts.select(provider, model, mode, 2 /* Selection */);
  if (selected) {
    progress.report(selected);
    await instaService.invokeFunction(formatDocumentRangesWithProvider, selected, editorOrModel, rangeOrRanges, token, userGesture);
  }
}
async function formatDocumentRangesWithProvider(accessor, provider, editorOrModel, rangeOrRanges, token, userGesture) {
  const workerService = accessor.get(IEditorWorkerService);
  const logService = accessor.get(ILogService);
  const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
  let model;
  let cts;
  if (isCodeEditor(editorOrModel)) {
    model = editorOrModel.getModel();
    cts = new EditorStateCancellationTokenSource(editorOrModel, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position, void 0, token);
  } else {
    model = editorOrModel;
    cts = new TextModelCancellationTokenSource(editorOrModel, token);
  }
  const ranges = [];
  let len = 0;
  for (const range of asArray(rangeOrRanges).sort(Range.compareRangesUsingStarts)) {
    if (len > 0 && Range.areIntersectingOrTouching(ranges[len - 1], range)) {
      ranges[len - 1] = Range.fromPositions(ranges[len - 1].getStartPosition(), range.getEndPosition());
    } else {
      len = ranges.push(range);
    }
  }
  const computeEdits = async (range) => {
    logService.trace(`[format][provideDocumentRangeFormattingEdits] (request)`, provider.extensionId?.value, range);
    const result = await provider.provideDocumentRangeFormattingEdits(
      model,
      range,
      model.getFormattingOptions(),
      cts.token
    ) || [];
    logService.trace(`[format][provideDocumentRangeFormattingEdits] (response)`, provider.extensionId?.value, result);
    return result;
  };
  const hasIntersectingEdit = (a, b) => {
    if (!a.length || !b.length) {
      return false;
    }
    const mergedA = a.reduce((acc, val) => {
      return Range.plusRange(acc, val.range);
    }, a[0].range);
    if (!b.some((x) => {
      return Range.intersectRanges(mergedA, x.range);
    })) {
      return false;
    }
    for (const edit of a) {
      for (const otherEdit of b) {
        if (Range.intersectRanges(edit.range, otherEdit.range)) {
          return true;
        }
      }
    }
    return false;
  };
  const allEdits = [];
  const rawEditsList = [];
  try {
    if (typeof provider.provideDocumentRangesFormattingEdits === "function") {
      logService.trace(`[format][provideDocumentRangeFormattingEdits] (request)`, provider.extensionId?.value, ranges);
      const result = await provider.provideDocumentRangesFormattingEdits(
        model,
        ranges,
        model.getFormattingOptions(),
        cts.token
      ) || [];
      logService.trace(`[format][provideDocumentRangeFormattingEdits] (response)`, provider.extensionId?.value, result);
      rawEditsList.push(result);
    } else {
      for (const range of ranges) {
        if (cts.token.isCancellationRequested) {
          return true;
        }
        rawEditsList.push(await computeEdits(range));
      }
      for (let i = 0; i < ranges.length; ++i) {
        for (let j = i + 1; j < ranges.length; ++j) {
          if (cts.token.isCancellationRequested) {
            return true;
          }
          if (hasIntersectingEdit(rawEditsList[i], rawEditsList[j])) {
            const mergedRange = Range.plusRange(ranges[i], ranges[j]);
            const edits = await computeEdits(mergedRange);
            ranges.splice(j, 1);
            ranges.splice(i, 1);
            ranges.push(mergedRange);
            rawEditsList.splice(j, 1);
            rawEditsList.splice(i, 1);
            rawEditsList.push(edits);
            i = 0;
            j = 0;
          }
        }
      }
    }
    for (const rawEdits of rawEditsList) {
      if (cts.token.isCancellationRequested) {
        return true;
      }
      const minimalEdits = await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
      if (minimalEdits) {
        allEdits.push(...minimalEdits);
      }
    }
    if (cts.token.isCancellationRequested) {
      return true;
    }
  } finally {
    cts.dispose();
  }
  if (allEdits.length === 0) {
    return false;
  }
  if (isCodeEditor(editorOrModel)) {
    FormattingEdit.execute(editorOrModel, allEdits, true);
    editorOrModel.revealPositionInCenterIfOutsideViewport(editorOrModel.getPosition(), ScrollType.Immediate);
  } else {
    const [{ range }] = allEdits;
    const initialSelection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
    model.pushEditOperations([initialSelection], allEdits.map((edit) => {
      return {
        text: edit.text,
        range: Range.lift(edit.range),
        forceMoveMarkers: true
      };
    }), (undoEdits) => {
      for (const { range: range2 } of undoEdits) {
        if (Range.areIntersectingOrTouching(range2, initialSelection)) {
          return [new Selection(range2.startLineNumber, range2.startColumn, range2.endLineNumber, range2.endColumn)];
        }
      }
      return null;
    });
  }
  accessibilitySignalService.playSignal(AccessibilitySignal.format, { userGesture });
  return true;
}
async function formatDocumentWithSelectedProvider(accessor, editorOrModel, mode, progress, token, userGesture) {
  const instaService = accessor.get(IInstantiationService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
  const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
  const selected = await FormattingConflicts.select(provider, model, mode, 1 /* File */);
  if (selected) {
    progress.report(selected);
    await instaService.invokeFunction(formatDocumentWithProvider, selected, editorOrModel, mode, token, userGesture);
  }
}
async function formatDocumentWithProvider(accessor, provider, editorOrModel, mode, token, userGesture) {
  const workerService = accessor.get(IEditorWorkerService);
  const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
  let model;
  let cts;
  if (isCodeEditor(editorOrModel)) {
    model = editorOrModel.getModel();
    cts = new EditorStateCancellationTokenSource(editorOrModel, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position, void 0, token);
  } else {
    model = editorOrModel;
    cts = new TextModelCancellationTokenSource(editorOrModel, token);
  }
  let edits;
  try {
    const rawEdits = await provider.provideDocumentFormattingEdits(
      model,
      model.getFormattingOptions(),
      cts.token
    );
    edits = await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
    if (cts.token.isCancellationRequested) {
      return true;
    }
  } finally {
    cts.dispose();
  }
  if (!edits || edits.length === 0) {
    return false;
  }
  if (isCodeEditor(editorOrModel)) {
    FormattingEdit.execute(editorOrModel, edits, mode !== 2 /* Silent */);
    if (mode !== 2 /* Silent */) {
      editorOrModel.revealPositionInCenterIfOutsideViewport(editorOrModel.getPosition(), ScrollType.Immediate);
    }
  } else {
    const [{ range }] = edits;
    const initialSelection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
    model.pushEditOperations([initialSelection], edits.map((edit) => {
      return {
        text: edit.text,
        range: Range.lift(edit.range),
        forceMoveMarkers: true
      };
    }), (undoEdits) => {
      for (const { range: range2 } of undoEdits) {
        if (Range.areIntersectingOrTouching(range2, initialSelection)) {
          return [new Selection(range2.startLineNumber, range2.startColumn, range2.endLineNumber, range2.endColumn)];
        }
      }
      return null;
    });
  }
  accessibilitySignalService.playSignal(AccessibilitySignal.format, { userGesture });
  return true;
}
async function getDocumentRangeFormattingEditsUntilResult(workerService, languageFeaturesService, model, range, options, token) {
  const providers = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);
  for (const provider of providers) {
    const rawEdits = await Promise.resolve(provider.provideDocumentRangeFormattingEdits(model, range, options, token)).catch(onUnexpectedExternalError);
    if (isNonEmptyArray(rawEdits)) {
      return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
    }
  }
  return void 0;
}
async function getDocumentFormattingEditsUntilResult(workerService, languageFeaturesService, model, options, token) {
  const providers = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
  for (const provider of providers) {
    const rawEdits = await Promise.resolve(provider.provideDocumentFormattingEdits(model, options, token)).catch(onUnexpectedExternalError);
    if (isNonEmptyArray(rawEdits)) {
      return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
    }
  }
  return void 0;
}
async function getDocumentFormattingEditsWithSelectedProvider(workerService, languageFeaturesService, editorOrModel, mode, token) {
  const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
  const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
  const selected = await FormattingConflicts.select(provider, model, mode, 1 /* File */);
  if (selected) {
    const rawEdits = await Promise.resolve(selected.provideDocumentFormattingEdits(model, model.getOptions(), token)).catch(onUnexpectedExternalError);
    return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
  }
  return void 0;
}
function getOnTypeFormattingEdits(workerService, languageFeaturesService, model, position, ch, options, token) {
  const providers = languageFeaturesService.onTypeFormattingEditProvider.ordered(model);
  if (providers.length === 0) {
    return Promise.resolve(void 0);
  }
  if (providers[0].autoFormatTriggerCharacters.indexOf(ch) < 0) {
    return Promise.resolve(void 0);
  }
  return Promise.resolve(providers[0].provideOnTypeFormattingEdits(model, position, ch, options, token)).catch(onUnexpectedExternalError).then((edits) => {
    return workerService.computeMoreMinimalEdits(model.uri, edits);
  });
}
function isFormattingOptions(obj) {
  const candidate = obj;
  return !!candidate && typeof candidate === "object" && typeof candidate.tabSize === "number" && typeof candidate.insertSpaces === "boolean";
}
CommandsRegistry.registerCommand("_executeFormatRangeProvider", async function(accessor, ...args) {
  const [resource, range, options] = args;
  assertType(URI.isUri(resource));
  assertType(Range.isIRange(range));
  const resolverService = accessor.get(ITextModelService);
  const workerService = accessor.get(IEditorWorkerService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const reference = await resolverService.createModelReference(resource);
  try {
    return getDocumentRangeFormattingEditsUntilResult(workerService, languageFeaturesService, reference.object.textEditorModel, Range.lift(range), ensureFormattingOptions(options, reference), CancellationToken.None);
  } finally {
    reference.dispose();
  }
});
CommandsRegistry.registerCommand("_executeFormatDocumentProvider", async function(accessor, ...args) {
  const [resource, options] = args;
  assertType(URI.isUri(resource));
  const resolverService = accessor.get(ITextModelService);
  const workerService = accessor.get(IEditorWorkerService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const reference = await resolverService.createModelReference(resource);
  try {
    return getDocumentFormattingEditsUntilResult(workerService, languageFeaturesService, reference.object.textEditorModel, ensureFormattingOptions(options, reference), CancellationToken.None);
  } finally {
    reference.dispose();
  }
});
CommandsRegistry.registerCommand("_executeFormatOnTypeProvider", async function(accessor, ...args) {
  const [resource, position, ch, options] = args;
  assertType(URI.isUri(resource));
  assertType(Position.isIPosition(position));
  assertType(typeof ch === "string");
  const resolverService = accessor.get(ITextModelService);
  const workerService = accessor.get(IEditorWorkerService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const reference = await resolverService.createModelReference(resource);
  try {
    return getOnTypeFormattingEdits(workerService, languageFeaturesService, reference.object.textEditorModel, Position.lift(position), ch, ensureFormattingOptions(options, reference), CancellationToken.None);
  } finally {
    reference.dispose();
  }
});
function ensureFormattingOptions(options, reference) {
  let validatedOptions;
  if (isFormattingOptions(options)) {
    validatedOptions = options;
  } else {
    const modelOptions = reference.object.textEditorModel.getOptions();
    validatedOptions = {
      tabSize: modelOptions.tabSize,
      insertSpaces: modelOptions.insertSpaces
    };
  }
  return validatedOptions;
}
export {
  FormattingConflicts,
  FormattingKind,
  FormattingMode,
  formatDocumentRangesWithProvider,
  formatDocumentRangesWithSelectedProvider,
  formatDocumentWithProvider,
  formatDocumentWithSelectedProvider,
  getDocumentFormattingEditsUntilResult,
  getDocumentFormattingEditsWithSelectedProvider,
  getDocumentRangeFormattingEditsUntilResult,
  getOnTypeFormattingEdits,
  getRealAndSyntheticDocumentFormattersOrdered
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZvcm1hdFxcYnJvd3NlclxcZm9ybWF0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNBcnJheSwgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yU3RhdGVGbGFnLCBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlLCBUZXh0TW9kZWxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uL2VkaXRvclN0YXRlL2Jyb3dzZXIvZWRpdG9yU3RhdGUuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBGb3JtYXR0aW5nT3B0aW9ucywgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nRWRpdCB9IGZyb20gJy4vZm9ybWF0dGluZ0VkaXQuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZWFsQW5kU3ludGhldGljRG9jdW1lbnRGb3JtYXR0ZXJzT3JkZXJlZChcblx0ZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXI+LFxuXHRkb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcjogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8RG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXI+LFxuXHRtb2RlbDogSVRleHRNb2RlbFxuKTogRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyW10ge1xuXHRjb25zdCByZXN1bHQ6IERvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcltdID0gW107XG5cdGNvbnN0IHNlZW4gPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllclNldCgpO1xuXG5cdC8vICgxKSBhZGQgYWxsIGRvY3VtZW50IGZvcm1hdHRlclxuXHRjb25zdCBkb2NGb3JtYXR0ZXIgPSBkb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub3JkZXJlZChtb2RlbCk7XG5cdGZvciAoY29uc3QgZm9ybWF0dGVyIG9mIGRvY0Zvcm1hdHRlcikge1xuXHRcdHJlc3VsdC5wdXNoKGZvcm1hdHRlcik7XG5cdFx0aWYgKGZvcm1hdHRlci5leHRlbnNpb25JZCkge1xuXHRcdFx0c2Vlbi5hZGQoZm9ybWF0dGVyLmV4dGVuc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHQvLyAoMikgYWRkIGFsbCByYW5nZSBmb3JtYXR0ZXIgYXMgZG9jdW1lbnQgZm9ybWF0dGVyICh1bmxlc3MgdGhlIHNhbWUgZXh0ZW5zaW9uIGFscmVhZHkgZGlkIHRoYXQpXG5cdGNvbnN0IHJhbmdlRm9ybWF0dGVyID0gZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub3JkZXJlZChtb2RlbCk7XG5cdGZvciAoY29uc3QgZm9ybWF0dGVyIG9mIHJhbmdlRm9ybWF0dGVyKSB7XG5cdFx0aWYgKGZvcm1hdHRlci5leHRlbnNpb25JZCkge1xuXHRcdFx0aWYgKHNlZW4uaGFzKGZvcm1hdHRlci5leHRlbnNpb25JZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzZWVuLmFkZChmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQpO1xuXHRcdH1cblx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRkaXNwbGF5TmFtZTogZm9ybWF0dGVyLmRpc3BsYXlOYW1lLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGZvcm1hdHRlci5leHRlbnNpb25JZCxcblx0XHRcdHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cyhtb2RlbCwgb3B0aW9ucywgdG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIGZvcm1hdHRlci5wcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cyhtb2RlbCwgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZvcm1hdHRpbmdLaW5kIHtcblx0RmlsZSA9IDEsXG5cdFNlbGVjdGlvbiA9IDJcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRm9ybWF0dGluZ01vZGUge1xuXHRFeHBsaWNpdCA9IDEsXG5cdFNpbGVudCA9IDJcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRm9ybWF0dGluZ0VkaXRQcm92aWRlclNlbGVjdG9yIHtcblx0PFQgZXh0ZW5kcyAoRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHwgRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIpPihmb3JtYXR0ZXI6IFRbXSwgZG9jdW1lbnQ6IElUZXh0TW9kZWwsIG1vZGU6IEZvcm1hdHRpbmdNb2RlLCBraW5kOiBGb3JtYXR0aW5nS2luZCk6IFByb21pc2U8VCB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBGb3JtYXR0aW5nQ29uZmxpY3RzIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc2VsZWN0b3JzID0gbmV3IExpbmtlZExpc3Q8SUZvcm1hdHRpbmdFZGl0UHJvdmlkZXJTZWxlY3Rvcj4oKTtcblxuXHRzdGF0aWMgc2V0Rm9ybWF0dGVyU2VsZWN0b3Ioc2VsZWN0b3I6IElGb3JtYXR0aW5nRWRpdFByb3ZpZGVyU2VsZWN0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVtb3ZlID0gRm9ybWF0dGluZ0NvbmZsaWN0cy5fc2VsZWN0b3JzLnVuc2hpZnQoc2VsZWN0b3IpO1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6IHJlbW92ZSB9O1xuXHR9XG5cblx0c3RhdGljIGFzeW5jIHNlbGVjdDxUIGV4dGVuZHMgKERvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB8IERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKT4oZm9ybWF0dGVyOiBUW10sIGRvY3VtZW50OiBJVGV4dE1vZGVsLCBtb2RlOiBGb3JtYXR0aW5nTW9kZSwga2luZDogRm9ybWF0dGluZ0tpbmQpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoZm9ybWF0dGVyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0b3IgPSBJdGVyYWJsZS5maXJzdChGb3JtYXR0aW5nQ29uZmxpY3RzLl9zZWxlY3RvcnMpO1xuXHRcdGlmIChzZWxlY3Rvcikge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHNlbGVjdG9yKGZvcm1hdHRlciwgZG9jdW1lbnQsIG1vZGUsIGtpbmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmb3JtYXREb2N1bWVudFJhbmdlc1dpdGhTZWxlY3RlZFByb3ZpZGVyKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0ZWRpdG9yT3JNb2RlbDogSVRleHRNb2RlbCB8IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRyYW5nZU9yUmFuZ2VzOiBSYW5nZSB8IFJhbmdlW10sXG5cdG1vZGU6IEZvcm1hdHRpbmdNb2RlLFxuXHRwcm9ncmVzczogSVByb2dyZXNzPERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyPixcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHR1c2VyR2VzdHVyZTogYm9vbGVhblxuKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHsgZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXI6IGRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyUmVnaXN0cnkgfSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRjb25zdCBtb2RlbCA9IGlzQ29kZUVkaXRvcihlZGl0b3JPck1vZGVsKSA/IGVkaXRvck9yTW9kZWwuZ2V0TW9kZWwoKSA6IGVkaXRvck9yTW9kZWw7XG5cdGNvbnN0IHByb3ZpZGVyID0gZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXJSZWdpc3RyeS5vcmRlcmVkKG1vZGVsKTtcblx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBGb3JtYXR0aW5nQ29uZmxpY3RzLnNlbGVjdChwcm92aWRlciwgbW9kZWwsIG1vZGUsIEZvcm1hdHRpbmdLaW5kLlNlbGVjdGlvbik7XG5cdGlmIChzZWxlY3RlZCkge1xuXHRcdHByb2dyZXNzLnJlcG9ydChzZWxlY3RlZCk7XG5cdFx0YXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZvcm1hdERvY3VtZW50UmFuZ2VzV2l0aFByb3ZpZGVyLCBzZWxlY3RlZCwgZWRpdG9yT3JNb2RlbCwgcmFuZ2VPclJhbmdlcywgdG9rZW4sIHVzZXJHZXN0dXJlKTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZm9ybWF0RG9jdW1lbnRSYW5nZXNXaXRoUHJvdmlkZXIoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRwcm92aWRlcjogRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsXG5cdGVkaXRvck9yTW9kZWw6IElUZXh0TW9kZWwgfCBJQWN0aXZlQ29kZUVkaXRvcixcblx0cmFuZ2VPclJhbmdlczogUmFuZ2UgfCBSYW5nZVtdLFxuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdHVzZXJHZXN0dXJlOiBib29sZWFuXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3Qgd29ya2VyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yV29ya2VyU2VydmljZSk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXG5cdGxldCBtb2RlbDogSVRleHRNb2RlbDtcblx0bGV0IGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdGlmIChpc0NvZGVFZGl0b3IoZWRpdG9yT3JNb2RlbCkpIHtcblx0XHRtb2RlbCA9IGVkaXRvck9yTW9kZWwuZ2V0TW9kZWwoKTtcblx0XHRjdHMgPSBuZXcgRWRpdG9yU3RhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZShlZGl0b3JPck1vZGVsLCBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlIHwgQ29kZUVkaXRvclN0YXRlRmxhZy5Qb3NpdGlvbiwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH0gZWxzZSB7XG5cdFx0bW9kZWwgPSBlZGl0b3JPck1vZGVsO1xuXHRcdGN0cyA9IG5ldyBUZXh0TW9kZWxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZShlZGl0b3JPck1vZGVsLCB0b2tlbik7XG5cdH1cblxuXHQvLyBtYWtlIHN1cmUgdGhhdCByYW5nZXMgZG9uJ3Qgb3ZlcmxhcCBub3IgdG91Y2ggZWFjaCBvdGhlclxuXHRjb25zdCByYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0bGV0IGxlbiA9IDA7XG5cdGZvciAoY29uc3QgcmFuZ2Ugb2YgYXNBcnJheShyYW5nZU9yUmFuZ2VzKS5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cykpIHtcblx0XHRpZiAobGVuID4gMCAmJiBSYW5nZS5hcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKHJhbmdlc1tsZW4gLSAxXSwgcmFuZ2UpKSB7XG5cdFx0XHRyYW5nZXNbbGVuIC0gMV0gPSBSYW5nZS5mcm9tUG9zaXRpb25zKHJhbmdlc1tsZW4gLSAxXS5nZXRTdGFydFBvc2l0aW9uKCksIHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZW4gPSByYW5nZXMucHVzaChyYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgY29tcHV0ZUVkaXRzID0gYXN5bmMgKHJhbmdlOiBSYW5nZSkgPT4ge1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoYFtmb3JtYXRdW3Byb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzXSAocmVxdWVzdClgLCBwcm92aWRlci5leHRlbnNpb25JZD8udmFsdWUsIHJhbmdlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBwcm92aWRlci5wcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cyhcblx0XHRcdG1vZGVsLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRtb2RlbC5nZXRGb3JtYXR0aW5nT3B0aW9ucygpLFxuXHRcdFx0Y3RzLnRva2VuXG5cdFx0KSkgfHwgW107XG5cblx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBbZm9ybWF0XVtwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0c10gKHJlc3BvbnNlKWAsIHByb3ZpZGVyLmV4dGVuc2lvbklkPy52YWx1ZSwgcmVzdWx0KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH07XG5cblx0Y29uc3QgaGFzSW50ZXJzZWN0aW5nRWRpdCA9IChhOiBUZXh0RWRpdFtdLCBiOiBUZXh0RWRpdFtdKSA9PiB7XG5cdFx0aWYgKCFhLmxlbmd0aCB8fCAhYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gcXVpY2sgZXhpdCBpZiB0aGUgbGlzdCBvZiByYW5nZXMgYXJlIGNvbXBsZXRlbHkgdW5yZWxhdGVkIFtPKG4pXVxuXHRcdGNvbnN0IG1lcmdlZEEgPSBhLnJlZHVjZSgoYWNjLCB2YWwpID0+IHsgcmV0dXJuIFJhbmdlLnBsdXNSYW5nZShhY2MsIHZhbC5yYW5nZSk7IH0sIGFbMF0ucmFuZ2UpO1xuXHRcdGlmICghYi5zb21lKHggPT4geyByZXR1cm4gUmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKG1lcmdlZEEsIHgucmFuZ2UpOyB9KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBmYWxsYmFjayB0byBhIGNvbXBsZXRlIGNoZWNrIFtPKG5eMildXG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIGEpIHtcblx0XHRcdGZvciAoY29uc3Qgb3RoZXJFZGl0IG9mIGIpIHtcblx0XHRcdFx0aWYgKFJhbmdlLmludGVyc2VjdFJhbmdlcyhlZGl0LnJhbmdlLCBvdGhlckVkaXQucmFuZ2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXG5cdGNvbnN0IGFsbEVkaXRzOiBUZXh0RWRpdFtdID0gW107XG5cdGNvbnN0IHJhd0VkaXRzTGlzdDogVGV4dEVkaXRbXVtdID0gW107XG5cdHRyeSB7XG5cdFx0aWYgKHR5cGVvZiBwcm92aWRlci5wcm92aWRlRG9jdW1lbnRSYW5nZXNGb3JtYXR0aW5nRWRpdHMgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYFtmb3JtYXRdW3Byb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzXSAocmVxdWVzdClgLCBwcm92aWRlci5leHRlbnNpb25JZD8udmFsdWUsIHJhbmdlcyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzKFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0cmFuZ2VzLFxuXHRcdFx0XHRtb2RlbC5nZXRGb3JtYXR0aW5nT3B0aW9ucygpLFxuXHRcdFx0XHRjdHMudG9rZW5cblx0XHRcdCkpIHx8IFtdO1xuXHRcdFx0bG9nU2VydmljZS50cmFjZShgW2Zvcm1hdF1bcHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHNdIChyZXNwb25zZSlgLCBwcm92aWRlci5leHRlbnNpb25JZD8udmFsdWUsIHJlc3VsdCk7XG5cdFx0XHRyYXdFZGl0c0xpc3QucHVzaChyZXN1bHQpO1xuXHRcdH0gZWxzZSB7XG5cblx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzKSB7XG5cdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyYXdFZGl0c0xpc3QucHVzaChhd2FpdCBjb21wdXRlRWRpdHMocmFuZ2UpKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyArK2kpIHtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcmFuZ2VzLmxlbmd0aDsgKytqKSB7XG5cdFx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChoYXNJbnRlcnNlY3RpbmdFZGl0KHJhd0VkaXRzTGlzdFtpXSwgcmF3RWRpdHNMaXN0W2pdKSkge1xuXHRcdFx0XHRcdFx0Ly8gTWVyZ2UgcmFuZ2VzIGkgYW5kIGogaW50byBhIHNpbmdsZSByYW5nZSwgcmVjb21wdXRlIHRoZSBhc3NvY2lhdGVkIGVkaXRzXG5cdFx0XHRcdFx0XHRjb25zdCBtZXJnZWRSYW5nZSA9IFJhbmdlLnBsdXNSYW5nZShyYW5nZXNbaV0sIHJhbmdlc1tqXSk7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IGNvbXB1dGVFZGl0cyhtZXJnZWRSYW5nZSk7XG5cdFx0XHRcdFx0XHRyYW5nZXMuc3BsaWNlKGosIDEpO1xuXHRcdFx0XHRcdFx0cmFuZ2VzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHRcdHJhbmdlcy5wdXNoKG1lcmdlZFJhbmdlKTtcblx0XHRcdFx0XHRcdHJhd0VkaXRzTGlzdC5zcGxpY2UoaiwgMSk7XG5cdFx0XHRcdFx0XHRyYXdFZGl0c0xpc3Quc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0cmF3RWRpdHNMaXN0LnB1c2goZWRpdHMpO1xuXHRcdFx0XHRcdFx0Ly8gUmVzdGFydCBzY2FubmluZ1xuXHRcdFx0XHRcdFx0aSA9IDA7XG5cdFx0XHRcdFx0XHRqID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHJhd0VkaXRzIG9mIHJhd0VkaXRzTGlzdCkge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1pbmltYWxFZGl0cyA9IGF3YWl0IHdvcmtlclNlcnZpY2UuY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLCByYXdFZGl0cyk7XG5cdFx0XHRpZiAobWluaW1hbEVkaXRzKSB7XG5cdFx0XHRcdGFsbEVkaXRzLnB1c2goLi4ubWluaW1hbEVkaXRzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH0gZmluYWxseSB7XG5cdFx0Y3RzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGlmIChhbGxFZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoaXNDb2RlRWRpdG9yKGVkaXRvck9yTW9kZWwpKSB7XG5cdFx0Ly8gdXNlIGVkaXRvciB0byBhcHBseSBlZGl0c1xuXHRcdEZvcm1hdHRpbmdFZGl0LmV4ZWN1dGUoZWRpdG9yT3JNb2RlbCwgYWxsRWRpdHMsIHRydWUpO1xuXHRcdGVkaXRvck9yTW9kZWwucmV2ZWFsUG9zaXRpb25JbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGVkaXRvck9yTW9kZWwuZ2V0UG9zaXRpb24oKSwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXG5cdH0gZWxzZSB7XG5cdFx0Ly8gdXNlIG1vZGVsIHRvIGFwcGx5IGVkaXRzXG5cdFx0Y29uc3QgW3sgcmFuZ2UgfV0gPSBhbGxFZGl0cztcblx0XHRjb25zdCBpbml0aWFsU2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbaW5pdGlhbFNlbGVjdGlvbl0sIGFsbEVkaXRzLm1hcChlZGl0ID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRleHQ6IGVkaXQudGV4dCxcblx0XHRcdFx0cmFuZ2U6IFJhbmdlLmxpZnQoZWRpdC5yYW5nZSksXG5cdFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IHRydWVcblx0XHRcdH07XG5cdFx0fSksIHVuZG9FZGl0cyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgcmFuZ2UgfSBvZiB1bmRvRWRpdHMpIHtcblx0XHRcdFx0aWYgKFJhbmdlLmFyZUludGVyc2VjdGluZ09yVG91Y2hpbmcocmFuZ2UsIGluaXRpYWxTZWxlY3Rpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtuZXcgU2VsZWN0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbildO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9KTtcblx0fVxuXHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZm9ybWF0LCB7IHVzZXJHZXN0dXJlIH0pO1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZvcm1hdERvY3VtZW50V2l0aFNlbGVjdGVkUHJvdmlkZXIoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRlZGl0b3JPck1vZGVsOiBJVGV4dE1vZGVsIHwgSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdG1vZGU6IEZvcm1hdHRpbmdNb2RlLFxuXHRwcm9ncmVzczogSVByb2dyZXNzPERvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcj4sXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0dXNlckdlc3R1cmU/OiBib29sZWFuXG4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3QgbW9kZWwgPSBpc0NvZGVFZGl0b3IoZWRpdG9yT3JNb2RlbCkgPyBlZGl0b3JPck1vZGVsLmdldE1vZGVsKCkgOiBlZGl0b3JPck1vZGVsO1xuXHRjb25zdCBwcm92aWRlciA9IGdldFJlYWxBbmRTeW50aGV0aWNEb2N1bWVudEZvcm1hdHRlcnNPcmRlcmVkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIG1vZGVsKTtcblx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBGb3JtYXR0aW5nQ29uZmxpY3RzLnNlbGVjdChwcm92aWRlciwgbW9kZWwsIG1vZGUsIEZvcm1hdHRpbmdLaW5kLkZpbGUpO1xuXHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRwcm9ncmVzcy5yZXBvcnQoc2VsZWN0ZWQpO1xuXHRcdGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXREb2N1bWVudFdpdGhQcm92aWRlciwgc2VsZWN0ZWQsIGVkaXRvck9yTW9kZWwsIG1vZGUsIHRva2VuLCB1c2VyR2VzdHVyZSk7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZvcm1hdERvY3VtZW50V2l0aFByb3ZpZGVyKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0cHJvdmlkZXI6IERvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcixcblx0ZWRpdG9yT3JNb2RlbDogSVRleHRNb2RlbCB8IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRtb2RlOiBGb3JtYXR0aW5nTW9kZSxcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHR1c2VyR2VzdHVyZT86IGJvb2xlYW5cbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCB3b3JrZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlKTtcblx0Y29uc3QgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKTtcblxuXHRsZXQgbW9kZWw6IElUZXh0TW9kZWw7XG5cdGxldCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRpZiAoaXNDb2RlRWRpdG9yKGVkaXRvck9yTW9kZWwpKSB7XG5cdFx0bW9kZWwgPSBlZGl0b3JPck1vZGVsLmdldE1vZGVsKCk7XG5cdFx0Y3RzID0gbmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoZWRpdG9yT3JNb2RlbCwgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSB8IENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb24sIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9IGVsc2Uge1xuXHRcdG1vZGVsID0gZWRpdG9yT3JNb2RlbDtcblx0XHRjdHMgPSBuZXcgVGV4dE1vZGVsQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoZWRpdG9yT3JNb2RlbCwgdG9rZW4pO1xuXHR9XG5cblx0bGV0IGVkaXRzOiBUZXh0RWRpdFtdIHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdGNvbnN0IHJhd0VkaXRzID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRtb2RlbC5nZXRGb3JtYXR0aW5nT3B0aW9ucygpLFxuXHRcdFx0Y3RzLnRva2VuXG5cdFx0KTtcblxuXHRcdGVkaXRzID0gYXdhaXQgd29ya2VyU2VydmljZS5jb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmksIHJhd0VkaXRzKTtcblxuXHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHR9IGZpbmFsbHkge1xuXHRcdGN0cy5kaXNwb3NlKCk7XG5cdH1cblxuXHRpZiAoIWVkaXRzIHx8IGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChpc0NvZGVFZGl0b3IoZWRpdG9yT3JNb2RlbCkpIHtcblx0XHQvLyB1c2UgZWRpdG9yIHRvIGFwcGx5IGVkaXRzXG5cdFx0Rm9ybWF0dGluZ0VkaXQuZXhlY3V0ZShlZGl0b3JPck1vZGVsLCBlZGl0cywgbW9kZSAhPT0gRm9ybWF0dGluZ01vZGUuU2lsZW50KTtcblxuXHRcdGlmIChtb2RlICE9PSBGb3JtYXR0aW5nTW9kZS5TaWxlbnQpIHtcblx0XHRcdGVkaXRvck9yTW9kZWwucmV2ZWFsUG9zaXRpb25JbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGVkaXRvck9yTW9kZWwuZ2V0UG9zaXRpb24oKSwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHRcdH1cblxuXHR9IGVsc2Uge1xuXHRcdC8vIHVzZSBtb2RlbCB0byBhcHBseSBlZGl0c1xuXHRcdGNvbnN0IFt7IHJhbmdlIH1dID0gZWRpdHM7XG5cdFx0Y29uc3QgaW5pdGlhbFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW2luaXRpYWxTZWxlY3Rpb25dLCBlZGl0cy5tYXAoZWRpdCA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXh0OiBlZGl0LnRleHQsXG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5saWZ0KGVkaXQucmFuZ2UpLFxuXHRcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH0pLCB1bmRvRWRpdHMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB7IHJhbmdlIH0gb2YgdW5kb0VkaXRzKSB7XG5cdFx0XHRcdGlmIChSYW5nZS5hcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKHJhbmdlLCBpbml0aWFsU2VsZWN0aW9uKSkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IFNlbGVjdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSk7XG5cdH1cblx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmZvcm1hdCwgeyB1c2VyR2VzdHVyZSB9KTtcblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXREb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQoXG5cdHdvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRtb2RlbDogSVRleHRNb2RlbCxcblx0cmFuZ2U6IFJhbmdlLFxuXHRvcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyxcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG4pOiBQcm9taXNlPFRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblxuXHRjb25zdCBwcm92aWRlcnMgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5vcmRlcmVkKG1vZGVsKTtcblx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBwcm92aWRlcnMpIHtcblx0XHRjb25zdCByYXdFZGl0cyA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShwcm92aWRlci5wcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cyhtb2RlbCwgcmFuZ2UsIG9wdGlvbnMsIHRva2VuKSkuY2F0Y2gob25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcik7XG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShyYXdFZGl0cykpIHtcblx0XHRcdHJldHVybiBhd2FpdCB3b3JrZXJTZXJ2aWNlLmNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaSwgcmF3RWRpdHMpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNVbnRpbFJlc3VsdChcblx0d29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRvcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyxcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG4pOiBQcm9taXNlPFRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblxuXHRjb25zdCBwcm92aWRlcnMgPSBnZXRSZWFsQW5kU3ludGhldGljRG9jdW1lbnRGb3JtYXR0ZXJzT3JkZXJlZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBtb2RlbCk7XG5cdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcHJvdmlkZXJzKSB7XG5cdFx0Y29uc3QgcmF3RWRpdHMgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKG1vZGVsLCBvcHRpb25zLCB0b2tlbikpLmNhdGNoKG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpO1xuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkocmF3RWRpdHMpKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgd29ya2VyU2VydmljZS5jb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmksIHJhd0VkaXRzKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldERvY3VtZW50Rm9ybWF0dGluZ0VkaXRzV2l0aFNlbGVjdGVkUHJvdmlkZXIoXG5cdHdvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRlZGl0b3JPck1vZGVsOiBJVGV4dE1vZGVsIHwgSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdG1vZGU6IEZvcm1hdHRpbmdNb2RlLFxuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG4pOiBQcm9taXNlPFRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgbW9kZWwgPSBpc0NvZGVFZGl0b3IoZWRpdG9yT3JNb2RlbCkgPyBlZGl0b3JPck1vZGVsLmdldE1vZGVsKCkgOiBlZGl0b3JPck1vZGVsO1xuXHRjb25zdCBwcm92aWRlciA9IGdldFJlYWxBbmRTeW50aGV0aWNEb2N1bWVudEZvcm1hdHRlcnNPcmRlcmVkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIG1vZGVsKTtcblx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBGb3JtYXR0aW5nQ29uZmxpY3RzLnNlbGVjdChwcm92aWRlciwgbW9kZWwsIG1vZGUsIEZvcm1hdHRpbmdLaW5kLkZpbGUpO1xuXHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRjb25zdCByYXdFZGl0cyA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShzZWxlY3RlZC5wcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMobW9kZWwsIG1vZGVsLmdldE9wdGlvbnMoKSwgdG9rZW4pKS5jYXRjaChvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKTtcblx0XHRyZXR1cm4gYXdhaXQgd29ya2VyU2VydmljZS5jb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmksIHJhd0VkaXRzKTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0T25UeXBlRm9ybWF0dGluZ0VkaXRzKFxuXHR3b3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdHBvc2l0aW9uOiBQb3NpdGlvbixcblx0Y2g6IHN0cmluZyxcblx0b3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMsXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuKTogUHJvbWlzZTxUZXh0RWRpdFtdIHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXG5cdGNvbnN0IHByb3ZpZGVycyA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub3JkZXJlZChtb2RlbCk7XG5cblx0aWYgKHByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRpZiAocHJvdmlkZXJzWzBdLmF1dG9Gb3JtYXRUcmlnZ2VyQ2hhcmFjdGVycy5pbmRleE9mKGNoKSA8IDApIHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyc1swXS5wcm92aWRlT25UeXBlRm9ybWF0dGluZ0VkaXRzKG1vZGVsLCBwb3NpdGlvbiwgY2gsIG9wdGlvbnMsIHRva2VuKSkuY2F0Y2gob25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcikudGhlbihlZGl0cyA9PiB7XG5cdFx0cmV0dXJuIHdvcmtlclNlcnZpY2UuY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLCBlZGl0cyk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBpc0Zvcm1hdHRpbmdPcHRpb25zKG9iajogdW5rbm93bik6IG9iaiBpcyBGb3JtYXR0aW5nT3B0aW9ucyB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IG9iaiBhcyBGb3JtYXR0aW5nT3B0aW9ucyB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gISFjYW5kaWRhdGUgJiYgdHlwZW9mIGNhbmRpZGF0ZSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIGNhbmRpZGF0ZS50YWJTaXplID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgY2FuZGlkYXRlLmluc2VydFNwYWNlcyA9PT0gJ2Jvb2xlYW4nO1xufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX2V4ZWN1dGVGb3JtYXRSYW5nZVByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yLCAuLi5hcmdzKSB7XG5cdGNvbnN0IFtyZXNvdXJjZSwgcmFuZ2UsIG9wdGlvbnNdID0gYXJncztcblx0YXNzZXJ0VHlwZShVUkkuaXNVcmkocmVzb3VyY2UpKTtcblx0YXNzZXJ0VHlwZShSYW5nZS5pc0lSYW5nZShyYW5nZSkpO1xuXG5cdGNvbnN0IHJlc29sdmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSk7XG5cdGNvbnN0IHdvcmtlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRjb25zdCByZWZlcmVuY2UgPSBhd2FpdCByZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpO1xuXHR0cnkge1xuXHRcdHJldHVybiBnZXREb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQod29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBSYW5nZS5saWZ0KHJhbmdlKSwgZW5zdXJlRm9ybWF0dGluZ09wdGlvbnMob3B0aW9ucywgcmVmZXJlbmNlKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH0gZmluYWxseSB7XG5cdFx0cmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZXhlY3V0ZUZvcm1hdERvY3VtZW50UHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3IsIC4uLmFyZ3MpIHtcblx0Y29uc3QgW3Jlc291cmNlLCBvcHRpb25zXSA9IGFyZ3M7XG5cdGFzc2VydFR5cGUoVVJJLmlzVXJpKHJlc291cmNlKSk7XG5cblx0Y29uc3QgcmVzb2x2ZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0TW9kZWxTZXJ2aWNlKTtcblx0Y29uc3Qgd29ya2VyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yV29ya2VyU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdGNvbnN0IHJlZmVyZW5jZSA9IGF3YWl0IHJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZSk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGdldERvY3VtZW50Rm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQod29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBlbnN1cmVGb3JtYXR0aW5nT3B0aW9ucyhvcHRpb25zLCByZWZlcmVuY2UpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fSBmaW5hbGx5IHtcblx0XHRyZWZlcmVuY2UuZGlzcG9zZSgpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19leGVjdXRlRm9ybWF0T25UeXBlUHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3IsIC4uLmFyZ3MpIHtcblx0Y29uc3QgW3Jlc291cmNlLCBwb3NpdGlvbiwgY2gsIG9wdGlvbnNdID0gYXJncztcblx0YXNzZXJ0VHlwZShVUkkuaXNVcmkocmVzb3VyY2UpKTtcblx0YXNzZXJ0VHlwZShQb3NpdGlvbi5pc0lQb3NpdGlvbihwb3NpdGlvbikpO1xuXHRhc3NlcnRUeXBlKHR5cGVvZiBjaCA9PT0gJ3N0cmluZycpO1xuXG5cdGNvbnN0IHJlc29sdmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSk7XG5cdGNvbnN0IHdvcmtlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRjb25zdCByZWZlcmVuY2UgPSBhd2FpdCByZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpO1xuXHR0cnkge1xuXHRcdHJldHVybiBnZXRPblR5cGVGb3JtYXR0aW5nRWRpdHMod29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBQb3NpdGlvbi5saWZ0KHBvc2l0aW9uKSwgY2gsIGVuc3VyZUZvcm1hdHRpbmdPcHRpb25zKG9wdGlvbnMsIHJlZmVyZW5jZSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdH1cbn0pO1xuZnVuY3Rpb24gZW5zdXJlRm9ybWF0dGluZ09wdGlvbnMob3B0aW9uczogdW5rbm93biwgcmVmZXJlbmNlOiBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4pOiBGb3JtYXR0aW5nT3B0aW9ucyB7XG5cdGxldCB2YWxpZGF0ZWRPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucztcblx0aWYgKGlzRm9ybWF0dGluZ09wdGlvbnMob3B0aW9ucykpIHtcblx0XHR2YWxpZGF0ZWRPcHRpb25zID0gb3B0aW9ucztcblx0fSBlbHNlIHtcblx0XHRjb25zdCBtb2RlbE9wdGlvbnMgPSByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0dmFsaWRhdGVkT3B0aW9ucyA9IHtcblx0XHRcdHRhYlNpemU6IG1vZGVsT3B0aW9ucy50YWJTaXplLFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBtb2RlbE9wdGlvbnMuaW5zZXJ0U3BhY2VzXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiB2YWxpZGF0ZWRPcHRpb25zO1xufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMseUJBQWtEO0FBQzNELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLHFCQUFxQixvQ0FBb0Msd0NBQXdDO0FBQzFHLFNBQTRCLG9CQUFvQjtBQUVoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBbUMseUJBQXlCO0FBQzVELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCLG1DQUFtQztBQUUxRCxTQUFTLDZDQUNmLGdDQUNBLHFDQUNBLE9BQ21DO0FBQ25DLFFBQU0sU0FBMkMsQ0FBQztBQUNsRCxRQUFNLE9BQU8sSUFBSSx1QkFBdUI7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LElBQUksaUJBQWlCO0FBQ3RELFFBQU0sZ0JBQWdCLFNBQVMsSUFBSSxvQkFBb0I7QUFDdkQsUUFBTSwwQkFBMEIsU0FBUyxJQUFJLHdCQUF3QjtBQUNyRSxRQUFNLFlBQVksTUFBTSxnQkFBZ0IscUJBQXFCLFFBQVE7QUFDckUsTUFBSTtBQUNILFdBQU8seUJBQXlCLGVBQWUseUJBQXlCLFVBQVUsT0FBTyxpQkFBaUIsU0FBUyxLQUFLLFFBQVEsR0FBRyxJQUFJLHdCQUF3QixTQUFTLFNBQVMsR0FBRyxrQkFBa0IsSUFBSTtBQUFBLEVBQzNNLFVBQUU7QUFDRCxjQUFVLFFBQVE7QUFBQSxFQUNuQjtBQUNELENBQUM7QUFDRCxTQUFTLHdCQUF3QixTQUFrQixXQUFvRTtBQUN0SCxNQUFJO0FBQ0osTUFBSSxvQkFBb0IsT0FBTyxHQUFHO0FBQ2pDLHVCQUFtQjtBQUFBLEVBQ3BCLE9BQU87QUFDTixVQUFNLGVBQWUsVUFBVSxPQUFPLGdCQUFnQixXQUFXO0FBQ2pFLHVCQUFtQjtBQUFBLE1BQ2xCLFNBQVMsYUFBYTtBQUFBLE1BQ3RCLGNBQWMsYUFBYTtBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsibW9kZWwiLCAiRm9ybWF0dGluZ0tpbmQiLCAiRm9ybWF0dGluZ01vZGUiLCAicmFuZ2UiXQp9Cg==
