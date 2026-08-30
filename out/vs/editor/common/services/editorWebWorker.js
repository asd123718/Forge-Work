import { stringDiff } from "../../../base/common/diff/diff.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { computeLinks } from "../languages/linkComputer.js";
import { BasicInplaceReplace } from "../languages/supports/inplaceReplaceSupport.js";
import { createMonacoBaseAPI } from "./editorBaseApi.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { UnicodeTextModelHighlighter } from "./unicodeTextModelHighlighter.js";
import { DiffComputer } from "../diff/legacyLinesDiffComputer.js";
import { DetailedLineRangeMapping } from "../diff/rangeMapping.js";
import { linesDiffComputers } from "../diff/linesDiffComputers.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { computeDefaultDocumentColors } from "../languages/defaultDocumentColorsComputer.js";
import { findSectionHeaders } from "./findSectionHeaders.js";
import { WorkerTextModelSyncServer } from "./textModelSync/textModelSync.impl.js";
import { StringText } from "../core/text/abstractText.js";
import { ensureDependenciesAreSet } from "../core/text/positionToOffset.js";
const _EditorWorker = class _EditorWorker {
  constructor(_foreignModule = null) {
    this._foreignModule = _foreignModule;
    this._requestHandlerBrand = void 0;
    this._workerTextModelSyncServer = new WorkerTextModelSyncServer();
  }
  dispose() {
  }
  async $ping() {
    return "pong";
  }
  _getModel(uri) {
    return this._workerTextModelSyncServer.getModel(uri);
  }
  getModels() {
    return this._workerTextModelSyncServer.getModels();
  }
  $acceptNewModel(data) {
    this._workerTextModelSyncServer.$acceptNewModel(data);
  }
  $acceptModelChanged(uri, e) {
    this._workerTextModelSyncServer.$acceptModelChanged(uri, e);
  }
  $acceptRemovedModel(uri) {
    this._workerTextModelSyncServer.$acceptRemovedModel(uri);
  }
  async $computeUnicodeHighlights(url, options, range) {
    const model = this._getModel(url);
    if (!model) {
      return { ranges: [], hasMore: false, ambiguousCharacterCount: 0, invisibleCharacterCount: 0, nonBasicAsciiCharacterCount: 0 };
    }
    return UnicodeTextModelHighlighter.computeUnicodeHighlights(model, options, range);
  }
  async $findSectionHeaders(url, options) {
    const model = this._getModel(url);
    if (!model) {
      return [];
    }
    return findSectionHeaders(model, options);
  }
  // ---- BEGIN diff --------------------------------------------------------------------------
  async $computeDiff(originalUrl, modifiedUrl, options, algorithm) {
    const original = this._getModel(originalUrl);
    const modified = this._getModel(modifiedUrl);
    if (!original || !modified) {
      return null;
    }
    const diffAlgorithm = await resolveLinesDiffComputer(algorithm);
    const result = _EditorWorker.computeDiff(original, modified, options, diffAlgorithm);
    return result;
  }
  static computeDiff(originalTextModel, modifiedTextModel, options, diffAlgorithm) {
    const originalLines = originalTextModel.getLinesContent();
    const modifiedLines = modifiedTextModel.getLinesContent();
    const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, options);
    const identical = result.changes.length > 0 ? false : this._modelsAreIdentical(originalTextModel, modifiedTextModel);
    function getLineChanges(changes) {
      return changes.map((m) => [m.original.startLineNumber, m.original.endLineNumberExclusive, m.modified.startLineNumber, m.modified.endLineNumberExclusive, m.innerChanges?.map((m2) => [
        m2.originalRange.startLineNumber,
        m2.originalRange.startColumn,
        m2.originalRange.endLineNumber,
        m2.originalRange.endColumn,
        m2.modifiedRange.startLineNumber,
        m2.modifiedRange.startColumn,
        m2.modifiedRange.endLineNumber,
        m2.modifiedRange.endColumn
      ])]);
    }
    return {
      identical,
      quitEarly: result.hitTimeout,
      changes: getLineChanges(result.changes),
      moves: result.moves.map((m) => [
        m.lineRangeMapping.original.startLineNumber,
        m.lineRangeMapping.original.endLineNumberExclusive,
        m.lineRangeMapping.modified.startLineNumber,
        m.lineRangeMapping.modified.endLineNumberExclusive,
        getLineChanges(m.changes)
      ])
    };
  }
  static _modelsAreIdentical(original, modified) {
    const originalLineCount = original.getLineCount();
    const modifiedLineCount = modified.getLineCount();
    if (originalLineCount !== modifiedLineCount) {
      return false;
    }
    for (let line = 1; line <= originalLineCount; line++) {
      const originalLine = original.getLineContent(line);
      const modifiedLine = modified.getLineContent(line);
      if (originalLine !== modifiedLine) {
        return false;
      }
    }
    return true;
  }
  async $computeDirtyDiff(originalUrl, modifiedUrl, ignoreTrimWhitespace) {
    const original = this._getModel(originalUrl);
    const modified = this._getModel(modifiedUrl);
    if (!original || !modified) {
      return null;
    }
    const originalLines = original.getLinesContent();
    const modifiedLines = modified.getLinesContent();
    const diffComputer = new DiffComputer(originalLines, modifiedLines, {
      shouldComputeCharChanges: false,
      shouldPostProcessCharChanges: false,
      shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
      shouldMakePrettyDiff: true,
      maxComputationTime: 1e3
    });
    return diffComputer.computeDiff().changes;
  }
  async $computeStringDiff(original, modified, options, algorithm) {
    return (await computeStringDiff(original, modified, options, algorithm)).toJson();
  }
  async $computeMoreMinimalEdits(modelUrl, edits, pretty) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return edits;
    }
    const result = [];
    let lastEol = void 0;
    edits = edits.slice(0).sort((a, b) => {
      if (a.range && b.range) {
        return Range.compareRangesUsingStarts(a.range, b.range);
      }
      const aRng = a.range ? 0 : 1;
      const bRng = b.range ? 0 : 1;
      return aRng - bRng;
    });
    let writeIndex = 0;
    for (let readIndex = 1; readIndex < edits.length; readIndex++) {
      if (Range.getEndPosition(edits[writeIndex].range).equals(Range.getStartPosition(edits[readIndex].range))) {
        edits[writeIndex].range = Range.fromPositions(Range.getStartPosition(edits[writeIndex].range), Range.getEndPosition(edits[readIndex].range));
        edits[writeIndex].text += edits[readIndex].text;
      } else {
        writeIndex++;
        edits[writeIndex] = edits[readIndex];
      }
    }
    edits.length = writeIndex + 1;
    for (let { range, text, eol } of edits) {
      if (typeof eol === "number") {
        lastEol = eol;
      }
      if (Range.isEmpty(range) && !text) {
        continue;
      }
      const original = model.getValueInRange(range);
      text = text.replace(/\r\n|\n|\r/g, model.eol);
      if (original === text) {
        continue;
      }
      if (Math.max(text.length, original.length) > _EditorWorker._diffLimit) {
        result.push({ range, text });
        continue;
      }
      const changes = stringDiff(original, text, pretty);
      const editOffset = model.offsetAt(Range.lift(range).getStartPosition());
      for (const change of changes) {
        const start = model.positionAt(editOffset + change.originalStart);
        const end = model.positionAt(editOffset + change.originalStart + change.originalLength);
        const newEdit = {
          text: text.substr(change.modifiedStart, change.modifiedLength),
          range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }
        };
        if (model.getValueInRange(newEdit.range) !== newEdit.text) {
          result.push(newEdit);
        }
      }
    }
    if (typeof lastEol === "number") {
      result.push({ eol: lastEol, text: "", range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
    }
    return result;
  }
  $computeHumanReadableDiff(modelUrl, edits, options) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return edits;
    }
    const result = [];
    let lastEol = void 0;
    edits = edits.slice(0).sort((a, b) => {
      if (a.range && b.range) {
        return Range.compareRangesUsingStarts(a.range, b.range);
      }
      const aRng = a.range ? 0 : 1;
      const bRng = b.range ? 0 : 1;
      return aRng - bRng;
    });
    for (let { range, text, eol } of edits) {
      let addPositions2 = function(pos1, pos2) {
        return new Position(pos1.lineNumber + pos2.lineNumber - 1, pos2.lineNumber === 1 ? pos1.column + pos2.column - 1 : pos2.column);
      }, getText2 = function(lines, range2) {
        const result2 = [];
        for (let i = range2.startLineNumber; i <= range2.endLineNumber; i++) {
          const line = lines[i - 1];
          if (i === range2.startLineNumber && i === range2.endLineNumber) {
            result2.push(line.substring(range2.startColumn - 1, range2.endColumn - 1));
          } else if (i === range2.startLineNumber) {
            result2.push(line.substring(range2.startColumn - 1));
          } else if (i === range2.endLineNumber) {
            result2.push(line.substring(0, range2.endColumn - 1));
          } else {
            result2.push(line);
          }
        }
        return result2;
      };
      var addPositions = addPositions2, getText = getText2;
      if (typeof eol === "number") {
        lastEol = eol;
      }
      if (Range.isEmpty(range) && !text) {
        continue;
      }
      const original = model.getValueInRange(range);
      text = text.replace(/\r\n|\n|\r/g, model.eol);
      if (original === text) {
        continue;
      }
      if (Math.max(text.length, original.length) > _EditorWorker._diffLimit) {
        result.push({ range, text });
        continue;
      }
      const originalLines = original.split(/\r\n|\n|\r/);
      const modifiedLines = text.split(/\r\n|\n|\r/);
      const diff = linesDiffComputers.getDefault().computeDiff(originalLines, modifiedLines, options);
      const start = Range.lift(range).getStartPosition();
      for (const c of diff.changes) {
        if (c.innerChanges) {
          for (const x of c.innerChanges) {
            result.push({
              range: Range.fromPositions(
                addPositions2(start, x.originalRange.getStartPosition()),
                addPositions2(start, x.originalRange.getEndPosition())
              ),
              text: getText2(modifiedLines, x.modifiedRange).join(model.eol)
            });
          }
        } else {
          throw new BugIndicatingError("The experimental diff algorithm always produces inner changes");
        }
      }
    }
    if (typeof lastEol === "number") {
      result.push({ eol: lastEol, text: "", range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
    }
    return result;
  }
  // ---- END minimal edits ---------------------------------------------------------------
  async $computeLinks(modelUrl) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return null;
    }
    return computeLinks(model);
  }
  // --- BEGIN default document colors -----------------------------------------------------------
  async $computeDefaultDocumentColors(modelUrl) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return null;
    }
    return computeDefaultDocumentColors(model);
  }
  async $textualSuggest(modelUrls, leadingWord, wordDef, wordDefFlags) {
    const sw = new StopWatch();
    const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
    const seen = /* @__PURE__ */ new Set();
    outer: for (const url of modelUrls) {
      const model = this._getModel(url);
      if (!model) {
        continue;
      }
      for (const word of model.words(wordDefRegExp)) {
        if (word === leadingWord || !isNaN(Number(word))) {
          continue;
        }
        seen.add(word);
        if (seen.size > _EditorWorker._suggestionsLimit) {
          break outer;
        }
      }
    }
    return { words: Array.from(seen), duration: sw.elapsed() };
  }
  // ---- END suggest --------------------------------------------------------------------------
  //#region -- word ranges --
  async $computeWordRanges(modelUrl, range, wordDef, wordDefFlags) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return /* @__PURE__ */ Object.create(null);
    }
    const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
    const result = /* @__PURE__ */ Object.create(null);
    for (let line = range.startLineNumber; line < range.endLineNumber; line++) {
      const words = model.getLineWords(line, wordDefRegExp);
      for (const word of words) {
        if (!isNaN(Number(word.word))) {
          continue;
        }
        let array = result[word.word];
        if (!array) {
          array = [];
          result[word.word] = array;
        }
        array.push({
          startLineNumber: line,
          startColumn: word.startColumn,
          endLineNumber: line,
          endColumn: word.endColumn
        });
      }
    }
    return result;
  }
  //#endregion
  async $navigateValueSet(modelUrl, range, up, wordDef, wordDefFlags) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return null;
    }
    const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
    if (range.startColumn === range.endColumn) {
      range = {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn + 1
      };
    }
    const selectionText = model.getValueInRange(range);
    const wordRange = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn }, wordDefRegExp);
    if (!wordRange) {
      return null;
    }
    const word = model.getValueInRange(wordRange);
    const result = BasicInplaceReplace.INSTANCE.navigateValueSet(range, selectionText, wordRange, word, up);
    return result;
  }
  // ---- BEGIN foreign module support --------------------------------------------------------------------------
  // foreign method request
  $fmr(method, args) {
    if (!this._foreignModule || typeof this._foreignModule[method] !== "function") {
      return Promise.reject(new Error("Missing requestHandler or method: " + method));
    }
    try {
      return Promise.resolve(this._foreignModule[method].apply(this._foreignModule, args));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  // ---- END foreign module support --------------------------------------------------------------------------
};
// ---- END diff --------------------------------------------------------------------------
// ---- BEGIN minimal edits ---------------------------------------------------------------
_EditorWorker._diffLimit = 1e5;
// ---- BEGIN suggest --------------------------------------------------------------------------
_EditorWorker._suggestionsLimit = 1e4;
let EditorWorker = _EditorWorker;
if (typeof importScripts === "function") {
  globalThis.monaco = createMonacoBaseAPI();
}
function resolveLinesDiffComputer(algorithm) {
  switch (algorithm) {
    case "legacy":
      return linesDiffComputers.getLegacy();
    case "advanced":
      return linesDiffComputers.getDefault();
    case "advanced-external":
      return linesDiffComputers.getAdvancedExternal();
    case "advanced-wasm":
      return linesDiffComputers.getAdvancedWasm();
  }
}
async function computeStringDiff(original, modified, options, algorithm) {
  const diffAlgorithm = await resolveLinesDiffComputer(algorithm);
  ensureDependenciesAreSet();
  const originalText = new StringText(original);
  const originalLines = originalText.getLines();
  const modifiedText = new StringText(modified);
  const modifiedLines = modifiedText.getLines();
  const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, { ignoreTrimWhitespace: false, maxComputationTimeMs: options.maxComputationTimeMs, computeMoves: false, extendToSubwords: false });
  const textEdit = DetailedLineRangeMapping.toTextEdit(result.changes, modifiedText);
  const strEdit = originalText.getTransformer().getStringEdit(textEdit);
  return strEdit;
}
export {
  EditorWorker,
  computeStringDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcc2VydmljZXNcXGVkaXRvcldlYldvcmtlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0cmluZ0RpZmYgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kaWZmL2RpZmYuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3dvcmtlci93ZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1pcnJvclRleHRNb2RlbCwgSU1vZGVsQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vbW9kZWwvbWlycm9yVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElDb2xvckluZm9ybWF0aW9uLCBJSW5wbGFjZVJlcGxhY2VTdXBwb3J0UmVzdWx0LCBJTGluaywgVGV4dEVkaXQgfSBmcm9tICcuLi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUxpbmtzIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xpbmtDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBCYXNpY0lucGxhY2VSZXBsYWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL3N1cHBvcnRzL2lucGxhY2VSZXBsYWNlU3VwcG9ydC5qcyc7XG5pbXBvcnQgeyBEaWZmQWxnb3JpdGhtTmFtZSwgSURpZmZDb21wdXRhdGlvblJlc3VsdCwgSUxpbmVDaGFuZ2UsIElVbmljb2RlSGlnaGxpZ2h0c1Jlc3VsdCB9IGZyb20gJy4vZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vbmFjb0Jhc2VBUEkgfSBmcm9tICcuL2VkaXRvckJhc2VBcGkuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlciwgVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucyB9IGZyb20gJy4vdW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmpzJztcbmltcG9ydCB7IERpZmZDb21wdXRlciwgSUNoYW5nZSB9IGZyb20gJy4uL2RpZmYvbGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSUxpbmVzRGlmZkNvbXB1dGVyLCBJTGluZXNEaWZmQ29tcHV0ZXJPcHRpb25zIH0gZnJvbSAnLi4vZGlmZi9saW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBsaW5lc0RpZmZDb21wdXRlcnMgfSBmcm9tICcuLi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVycy5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmUHJvdmlkZXJPcHRpb25zIH0gZnJvbSAnLi4vZGlmZi9kb2N1bWVudERpZmZQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyB9IGZyb20gJy4uL2xhbmd1YWdlcy9kZWZhdWx0RG9jdW1lbnRDb2xvcnNDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMsIFNlY3Rpb25IZWFkZXIsIGZpbmRTZWN0aW9uSGVhZGVycyB9IGZyb20gJy4vZmluZFNlY3Rpb25IZWFkZXJzLmpzJztcbmltcG9ydCB7IElSYXdNb2RlbERhdGEsIElXb3JrZXJUZXh0TW9kZWxTeW5jQ2hhbm5lbFNlcnZlciB9IGZyb20gJy4vdGV4dE1vZGVsU3luYy90ZXh0TW9kZWxTeW5jLnByb3RvY29sLmpzJztcbmltcG9ydCB7IElDb21tb25Nb2RlbCwgV29ya2VyVGV4dE1vZGVsU3luY1NlcnZlciB9IGZyb20gJy4vdGV4dE1vZGVsU3luYy90ZXh0TW9kZWxTeW5jLmltcGwuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRTdHJpbmdFZGl0LCBTdHJpbmdFZGl0IH0gZnJvbSAnLi4vY29yZS9lZGl0cy9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IFN0cmluZ1RleHQgfSBmcm9tICcuLi9jb3JlL3RleHQvYWJzdHJhY3RUZXh0LmpzJztcbmltcG9ydCB7IGVuc3VyZURlcGVuZGVuY2llc0FyZVNldCB9IGZyb20gJy4uL2NvcmUvdGV4dC9wb3NpdGlvblRvT2Zmc2V0LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTWlycm9yTW9kZWwgZXh0ZW5kcyBJTWlycm9yVGV4dE1vZGVsIHtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcblx0Z2V0VmFsdWUoKTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrZXJDb250ZXh0PEggPSB7fT4ge1xuXHQvKipcblx0ICogQSBwcm94eSB0byB0aGUgbWFpbiB0aHJlYWQgaG9zdCBvYmplY3QuXG5cdCAqL1xuXHRob3N0OiBIO1xuXHQvKipcblx0ICogR2V0IGFsbCBhdmFpbGFibGUgbWlycm9yIG1vZGVscyBpbiB0aGlzIHdvcmtlci5cblx0ICovXG5cdGdldE1pcnJvck1vZGVscygpOiBJTWlycm9yTW9kZWxbXTtcbn1cblxuLyoqXG4gKiBSYW5nZSBvZiBhIHdvcmQgaW5zaWRlIGEgbW9kZWwuXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJV29yZFJhbmdlIHtcblx0LyoqXG5cdCAqIFRoZSBpbmRleCB3aGVyZSB0aGUgd29yZCBzdGFydHMuXG5cdCAqL1xuXHRyZWFkb25seSBzdGFydDogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlIGluZGV4IHdoZXJlIHRoZSB3b3JkIGVuZHMuXG5cdCAqL1xuXHRyZWFkb25seSBlbmQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNsYXNzIEVkaXRvcldvcmtlciBpbXBsZW1lbnRzIElEaXNwb3NhYmxlLCBJV29ya2VyVGV4dE1vZGVsU3luY0NoYW5uZWxTZXJ2ZXIsIElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB7XG5cdF9yZXF1ZXN0SGFuZGxlckJyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtlclRleHRNb2RlbFN5bmNTZXJ2ZXIgPSBuZXcgV29ya2VyVGV4dE1vZGVsU3luY1NlcnZlcigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZvcmVpZ25Nb2R1bGU6IHVua25vd24gfCBudWxsID0gbnVsbFxuXHQpIHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHBpbmcoKSB7XG5cdFx0cmV0dXJuICdwb25nJztcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0TW9kZWwodXJpOiBzdHJpbmcpOiBJQ29tbW9uTW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3JrZXJUZXh0TW9kZWxTeW5jU2VydmVyLmdldE1vZGVsKHVyaSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW9kZWxzKCk6IElDb21tb25Nb2RlbFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fd29ya2VyVGV4dE1vZGVsU3luY1NlcnZlci5nZXRNb2RlbHMoKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0TmV3TW9kZWwoZGF0YTogSVJhd01vZGVsRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtlclRleHRNb2RlbFN5bmNTZXJ2ZXIuJGFjY2VwdE5ld01vZGVsKGRhdGEpO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHRNb2RlbENoYW5nZWQodXJpOiBzdHJpbmcsIGU6IElNb2RlbENoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtlclRleHRNb2RlbFN5bmNTZXJ2ZXIuJGFjY2VwdE1vZGVsQ2hhbmdlZCh1cmksIGUpO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHRSZW1vdmVkTW9kZWwodXJpOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93b3JrZXJUZXh0TW9kZWxTeW5jU2VydmVyLiRhY2NlcHRSZW1vdmVkTW9kZWwodXJpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkY29tcHV0ZVVuaWNvZGVIaWdobGlnaHRzKHVybDogc3RyaW5nLCBvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zLCByYW5nZT86IElSYW5nZSk6IFByb21pc2U8SVVuaWNvZGVIaWdobGlnaHRzUmVzdWx0PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbCh1cmwpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB7IHJhbmdlczogW10sIGhhc01vcmU6IGZhbHNlLCBhbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudDogMCwgaW52aXNpYmxlQ2hhcmFjdGVyQ291bnQ6IDAsIG5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJDb3VudDogMCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gVW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmNvbXB1dGVVbmljb2RlSGlnaGxpZ2h0cyhtb2RlbCwgb3B0aW9ucywgcmFuZ2UpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRmaW5kU2VjdGlvbkhlYWRlcnModXJsOiBzdHJpbmcsIG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyk6IFByb21pc2U8U2VjdGlvbkhlYWRlcltdPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbCh1cmwpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdH1cblxuXHQvLyAtLS0tIEJFR0lOIGRpZmYgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwdWJsaWMgYXN5bmMgJGNvbXB1dGVEaWZmKG9yaWdpbmFsVXJsOiBzdHJpbmcsIG1vZGlmaWVkVXJsOiBzdHJpbmcsIG9wdGlvbnM6IElEb2N1bWVudERpZmZQcm92aWRlck9wdGlvbnMsIGFsZ29yaXRobTogRGlmZkFsZ29yaXRobU5hbWUpOiBQcm9taXNlPElEaWZmQ29tcHV0YXRpb25SZXN1bHQgfCBudWxsPiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSB0aGlzLl9nZXRNb2RlbChvcmlnaW5hbFVybCk7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSB0aGlzLl9nZXRNb2RlbChtb2RpZmllZFVybCk7XG5cdFx0aWYgKCFvcmlnaW5hbCB8fCAhbW9kaWZpZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpZmZBbGdvcml0aG0gPSBhd2FpdCByZXNvbHZlTGluZXNEaWZmQ29tcHV0ZXIoYWxnb3JpdGhtKTtcblx0XHRjb25zdCByZXN1bHQgPSBFZGl0b3JXb3JrZXIuY29tcHV0ZURpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBvcHRpb25zLCBkaWZmQWxnb3JpdGhtKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgY29tcHV0ZURpZmYob3JpZ2luYWxUZXh0TW9kZWw6IElDb21tb25Nb2RlbCB8IElUZXh0TW9kZWwsIG1vZGlmaWVkVGV4dE1vZGVsOiBJQ29tbW9uTW9kZWwgfCBJVGV4dE1vZGVsLCBvcHRpb25zOiBJRG9jdW1lbnREaWZmUHJvdmlkZXJPcHRpb25zLCBkaWZmQWxnb3JpdGhtOiBJTGluZXNEaWZmQ29tcHV0ZXIpOiBJRGlmZkNvbXB1dGF0aW9uUmVzdWx0IHtcblxuXHRcdGNvbnN0IG9yaWdpbmFsTGluZXMgPSBvcmlnaW5hbFRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKTtcblx0XHRjb25zdCBtb2RpZmllZExpbmVzID0gbW9kaWZpZWRUZXh0TW9kZWwuZ2V0TGluZXNDb250ZW50KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBkaWZmQWxnb3JpdGhtLmNvbXB1dGVEaWZmKG9yaWdpbmFsTGluZXMsIG1vZGlmaWVkTGluZXMsIG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgaWRlbnRpY2FsID0gKHJlc3VsdC5jaGFuZ2VzLmxlbmd0aCA+IDAgPyBmYWxzZSA6IHRoaXMuX21vZGVsc0FyZUlkZW50aWNhbChvcmlnaW5hbFRleHRNb2RlbCwgbW9kaWZpZWRUZXh0TW9kZWwpKTtcblxuXHRcdGZ1bmN0aW9uIGdldExpbmVDaGFuZ2VzKGNoYW5nZXM6IHJlYWRvbmx5IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdKTogSUxpbmVDaGFuZ2VbXSB7XG5cdFx0XHRyZXR1cm4gY2hhbmdlcy5tYXAobSA9PiAoW20ub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyLCBtLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsIG0ubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLCBtLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsIG0uaW5uZXJDaGFuZ2VzPy5tYXAobSA9PiBbXG5cdFx0XHRcdG0ub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdG0ub3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0bS5vcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdG0ub3JpZ2luYWxSYW5nZS5lbmRDb2x1bW4sXG5cdFx0XHRcdG0ubW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdG0ubW9kaWZpZWRSYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0bS5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdG0ubW9kaWZpZWRSYW5nZS5lbmRDb2x1bW4sXG5cdFx0XHRdKV0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWRlbnRpY2FsLFxuXHRcdFx0cXVpdEVhcmx5OiByZXN1bHQuaGl0VGltZW91dCxcblx0XHRcdGNoYW5nZXM6IGdldExpbmVDaGFuZ2VzKHJlc3VsdC5jaGFuZ2VzKSxcblx0XHRcdG1vdmVzOiByZXN1bHQubW92ZXMubWFwKG0gPT4gKFtcblx0XHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsXG5cdFx0XHRcdG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLFxuXHRcdFx0XHRnZXRMaW5lQ2hhbmdlcyhtLmNoYW5nZXMpXG5cdFx0XHRdKSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb2RlbHNBcmVJZGVudGljYWwob3JpZ2luYWw6IElDb21tb25Nb2RlbCB8IElUZXh0TW9kZWwsIG1vZGlmaWVkOiBJQ29tbW9uTW9kZWwgfCBJVGV4dE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxMaW5lQ291bnQgPSBvcmlnaW5hbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBtb2RpZmllZExpbmVDb3VudCA9IG1vZGlmaWVkLmdldExpbmVDb3VudCgpO1xuXHRcdGlmIChvcmlnaW5hbExpbmVDb3VudCAhPT0gbW9kaWZpZWRMaW5lQ291bnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgbGluZSA9IDE7IGxpbmUgPD0gb3JpZ2luYWxMaW5lQ291bnQ7IGxpbmUrKykge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxMaW5lID0gb3JpZ2luYWwuZ2V0TGluZUNvbnRlbnQobGluZSk7XG5cdFx0XHRjb25zdCBtb2RpZmllZExpbmUgPSBtb2RpZmllZC5nZXRMaW5lQ29udGVudChsaW5lKTtcblx0XHRcdGlmIChvcmlnaW5hbExpbmUgIT09IG1vZGlmaWVkTGluZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRjb21wdXRlRGlydHlEaWZmKG9yaWdpbmFsVXJsOiBzdHJpbmcsIG1vZGlmaWVkVXJsOiBzdHJpbmcsIGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBib29sZWFuKTogUHJvbWlzZTxJQ2hhbmdlW10gfCBudWxsPiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSB0aGlzLl9nZXRNb2RlbChvcmlnaW5hbFVybCk7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSB0aGlzLl9nZXRNb2RlbChtb2RpZmllZFVybCk7XG5cdFx0aWYgKCFvcmlnaW5hbCB8fCAhbW9kaWZpZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsTGluZXMgPSBvcmlnaW5hbC5nZXRMaW5lc0NvbnRlbnQoKTtcblx0XHRjb25zdCBtb2RpZmllZExpbmVzID0gbW9kaWZpZWQuZ2V0TGluZXNDb250ZW50KCk7XG5cdFx0Y29uc3QgZGlmZkNvbXB1dGVyID0gbmV3IERpZmZDb21wdXRlcihvcmlnaW5hbExpbmVzLCBtb2RpZmllZExpbmVzLCB7XG5cdFx0XHRzaG91bGRDb21wdXRlQ2hhckNoYW5nZXM6IGZhbHNlLFxuXHRcdFx0c2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlczogZmFsc2UsXG5cdFx0XHRzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZTogaWdub3JlVHJpbVdoaXRlc3BhY2UsXG5cdFx0XHRzaG91bGRNYWtlUHJldHR5RGlmZjogdHJ1ZSxcblx0XHRcdG1heENvbXB1dGF0aW9uVGltZTogMTAwMFxuXHRcdH0pO1xuXHRcdHJldHVybiBkaWZmQ29tcHV0ZXIuY29tcHV0ZURpZmYoKS5jaGFuZ2VzO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRjb21wdXRlU3RyaW5nRGlmZihvcmlnaW5hbDogc3RyaW5nLCBtb2RpZmllZDogc3RyaW5nLCBvcHRpb25zOiB7IG1heENvbXB1dGF0aW9uVGltZU1zOiBudW1iZXIgfSwgYWxnb3JpdGhtOiBEaWZmQWxnb3JpdGhtTmFtZSk6IFByb21pc2U8SVNlcmlhbGl6ZWRTdHJpbmdFZGl0PiB7XG5cdFx0cmV0dXJuIChhd2FpdCBjb21wdXRlU3RyaW5nRGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIG9wdGlvbnMsIGFsZ29yaXRobSkpLnRvSnNvbigpO1xuXHR9XG5cblx0Ly8gLS0tLSBFTkQgZGlmZiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cblx0Ly8gLS0tLSBCRUdJTiBtaW5pbWFsIGVkaXRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9kaWZmTGltaXQgPSAxMDAwMDA7XG5cblx0cHVibGljIGFzeW5jICRjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbFVybDogc3RyaW5nLCBlZGl0czogVGV4dEVkaXRbXSwgcHJldHR5OiBib29sZWFuKTogUHJvbWlzZTxUZXh0RWRpdFtdPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbChtb2RlbFVybCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIGVkaXRzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogVGV4dEVkaXRbXSA9IFtdO1xuXHRcdGxldCBsYXN0RW9sOiBFbmRPZkxpbmVTZXF1ZW5jZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGVkaXRzID0gZWRpdHMuc2xpY2UoMCkuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEucmFuZ2UgJiYgYi5yYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gZW9sIG9ubHkgY2hhbmdlcyBzaG91bGQgZ28gdG8gdGhlIGVuZFxuXHRcdFx0Y29uc3QgYVJuZyA9IGEucmFuZ2UgPyAwIDogMTtcblx0XHRcdGNvbnN0IGJSbmcgPSBiLnJhbmdlID8gMCA6IDE7XG5cdFx0XHRyZXR1cm4gYVJuZyAtIGJSbmc7XG5cdFx0fSk7XG5cblx0XHQvLyBtZXJnZSBhZGphY2VudCBlZGl0c1xuXHRcdGxldCB3cml0ZUluZGV4ID0gMDtcblx0XHRmb3IgKGxldCByZWFkSW5kZXggPSAxOyByZWFkSW5kZXggPCBlZGl0cy5sZW5ndGg7IHJlYWRJbmRleCsrKSB7XG5cdFx0XHRpZiAoUmFuZ2UuZ2V0RW5kUG9zaXRpb24oZWRpdHNbd3JpdGVJbmRleF0ucmFuZ2UpLmVxdWFscyhSYW5nZS5nZXRTdGFydFBvc2l0aW9uKGVkaXRzW3JlYWRJbmRleF0ucmFuZ2UpKSkge1xuXHRcdFx0XHRlZGl0c1t3cml0ZUluZGV4XS5yYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbihlZGl0c1t3cml0ZUluZGV4XS5yYW5nZSksIFJhbmdlLmdldEVuZFBvc2l0aW9uKGVkaXRzW3JlYWRJbmRleF0ucmFuZ2UpKTtcblx0XHRcdFx0ZWRpdHNbd3JpdGVJbmRleF0udGV4dCArPSBlZGl0c1tyZWFkSW5kZXhdLnRleHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3cml0ZUluZGV4Kys7XG5cdFx0XHRcdGVkaXRzW3dyaXRlSW5kZXhdID0gZWRpdHNbcmVhZEluZGV4XTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWRpdHMubGVuZ3RoID0gd3JpdGVJbmRleCArIDE7XG5cblx0XHRmb3IgKGxldCB7IHJhbmdlLCB0ZXh0LCBlb2wgfSBvZiBlZGl0cykge1xuXG5cdFx0XHRpZiAodHlwZW9mIGVvbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0bGFzdEVvbCA9IGVvbDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKFJhbmdlLmlzRW1wdHkocmFuZ2UpICYmICF0ZXh0KSB7XG5cdFx0XHRcdC8vIGVtcHR5IGNoYW5nZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRcdFx0dGV4dCA9IHRleHQucmVwbGFjZSgvXFxyXFxufFxcbnxcXHIvZywgbW9kZWwuZW9sKTtcblxuXHRcdFx0aWYgKG9yaWdpbmFsID09PSB0ZXh0KSB7XG5cdFx0XHRcdC8vIG5vb3Bcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG1ha2Ugc3VyZSBkaWZmIHdvbid0IHRha2UgdG9vIGxvbmdcblx0XHRcdGlmIChNYXRoLm1heCh0ZXh0Lmxlbmd0aCwgb3JpZ2luYWwubGVuZ3RoKSA+IEVkaXRvcldvcmtlci5fZGlmZkxpbWl0KSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgcmFuZ2UsIHRleHQgfSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjb21wdXRlIGRpZmYgYmV0d2VlbiBvcmlnaW5hbCBhbmQgZWRpdC50ZXh0XG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gc3RyaW5nRGlmZihvcmlnaW5hbCwgdGV4dCwgcHJldHR5KTtcblx0XHRcdGNvbnN0IGVkaXRPZmZzZXQgPSBtb2RlbC5vZmZzZXRBdChSYW5nZS5saWZ0KHJhbmdlKS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0ID0gbW9kZWwucG9zaXRpb25BdChlZGl0T2Zmc2V0ICsgY2hhbmdlLm9yaWdpbmFsU3RhcnQpO1xuXHRcdFx0XHRjb25zdCBlbmQgPSBtb2RlbC5wb3NpdGlvbkF0KGVkaXRPZmZzZXQgKyBjaGFuZ2Uub3JpZ2luYWxTdGFydCArIGNoYW5nZS5vcmlnaW5hbExlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IG5ld0VkaXQ6IFRleHRFZGl0ID0ge1xuXHRcdFx0XHRcdHRleHQ6IHRleHQuc3Vic3RyKGNoYW5nZS5tb2RpZmllZFN0YXJ0LCBjaGFuZ2UubW9kaWZpZWRMZW5ndGgpLFxuXHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogc3RhcnQubGluZU51bWJlciwgc3RhcnRDb2x1bW46IHN0YXJ0LmNvbHVtbiwgZW5kTGluZU51bWJlcjogZW5kLmxpbmVOdW1iZXIsIGVuZENvbHVtbjogZW5kLmNvbHVtbiB9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXdFZGl0LnJhbmdlKSAhPT0gbmV3RWRpdC50ZXh0KSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobmV3RWRpdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGxhc3RFb2wgPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IGVvbDogbGFzdEVvbCwgdGV4dDogJycsIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMCwgc3RhcnRDb2x1bW46IDAsIGVuZExpbmVOdW1iZXI6IDAsIGVuZENvbHVtbjogMCB9IH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgJGNvbXB1dGVIdW1hblJlYWRhYmxlRGlmZihtb2RlbFVybDogc3RyaW5nLCBlZGl0czogVGV4dEVkaXRbXSwgb3B0aW9uczogSUxpbmVzRGlmZkNvbXB1dGVyT3B0aW9ucyk6IFRleHRFZGl0W10ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZ2V0TW9kZWwobW9kZWxVcmwpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBlZGl0cztcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IFRleHRFZGl0W10gPSBbXTtcblx0XHRsZXQgbGFzdEVvbDogRW5kT2ZMaW5lU2VxdWVuY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRlZGl0cyA9IGVkaXRzLnNsaWNlKDApLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLnJhbmdlICYmIGIucmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLnJhbmdlLCBiLnJhbmdlKTtcblx0XHRcdH1cblx0XHRcdC8vIGVvbCBvbmx5IGNoYW5nZXMgc2hvdWxkIGdvIHRvIHRoZSBlbmRcblx0XHRcdGNvbnN0IGFSbmcgPSBhLnJhbmdlID8gMCA6IDE7XG5cdFx0XHRjb25zdCBiUm5nID0gYi5yYW5nZSA/IDAgOiAxO1xuXHRcdFx0cmV0dXJuIGFSbmcgLSBiUm5nO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChsZXQgeyByYW5nZSwgdGV4dCwgZW9sIH0gb2YgZWRpdHMpIHtcblxuXHRcdFx0aWYgKHR5cGVvZiBlb2wgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGxhc3RFb2wgPSBlb2w7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChSYW5nZS5pc0VtcHR5KHJhbmdlKSAmJiAhdGV4dCkge1xuXHRcdFx0XHQvLyBlbXB0eSBjaGFuZ2Vcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKTtcblx0XHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xcclxcbnxcXG58XFxyL2csIG1vZGVsLmVvbCk7XG5cblx0XHRcdGlmIChvcmlnaW5hbCA9PT0gdGV4dCkge1xuXHRcdFx0XHQvLyBub29wXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBtYWtlIHN1cmUgZGlmZiB3b24ndCB0YWtlIHRvbyBsb25nXG5cdFx0XHRpZiAoTWF0aC5tYXgodGV4dC5sZW5ndGgsIG9yaWdpbmFsLmxlbmd0aCkgPiBFZGl0b3JXb3JrZXIuX2RpZmZMaW1pdCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHJhbmdlLCB0ZXh0IH0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gY29tcHV0ZSBkaWZmIGJldHdlZW4gb3JpZ2luYWwgYW5kIGVkaXQudGV4dFxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbExpbmVzID0gb3JpZ2luYWwuc3BsaXQoL1xcclxcbnxcXG58XFxyLyk7XG5cdFx0XHRjb25zdCBtb2RpZmllZExpbmVzID0gdGV4dC5zcGxpdCgvXFxyXFxufFxcbnxcXHIvKTtcblxuXHRcdFx0Y29uc3QgZGlmZiA9IGxpbmVzRGlmZkNvbXB1dGVycy5nZXREZWZhdWx0KCkuY29tcHV0ZURpZmYob3JpZ2luYWxMaW5lcywgbW9kaWZpZWRMaW5lcywgb3B0aW9ucyk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0ID0gUmFuZ2UubGlmdChyYW5nZSkuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXG5cdFx0XHRmdW5jdGlvbiBhZGRQb3NpdGlvbnMocG9zMTogUG9zaXRpb24sIHBvczI6IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHBvczEubGluZU51bWJlciArIHBvczIubGluZU51bWJlciAtIDEsIHBvczIubGluZU51bWJlciA9PT0gMSA/IHBvczEuY29sdW1uICsgcG9zMi5jb2x1bW4gLSAxIDogcG9zMi5jb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBnZXRUZXh0KGxpbmVzOiBzdHJpbmdbXSwgcmFuZ2U6IFJhbmdlKTogc3RyaW5nW10ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGZvciAobGV0IGkgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGkgPD0gcmFuZ2UuZW5kTGluZU51bWJlcjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2kgLSAxXTtcblx0XHRcdFx0XHRpZiAoaSA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGkgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGxpbmUuc3Vic3RyaW5nKHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgcmFuZ2UuZW5kQ29sdW1uIC0gMSkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaSA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChsaW5lLnN1YnN0cmluZyhyYW5nZS5zdGFydENvbHVtbiAtIDEpKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGkgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGxpbmUuc3Vic3RyaW5nKDAsIHJhbmdlLmVuZENvbHVtbiAtIDEpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2gobGluZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgYyBvZiBkaWZmLmNoYW5nZXMpIHtcblx0XHRcdFx0aWYgKGMuaW5uZXJDaGFuZ2VzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB4IG9mIGMuaW5uZXJDaGFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0XHRcdFx0XHRcdGFkZFBvc2l0aW9ucyhzdGFydCwgeC5vcmlnaW5hbFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSksXG5cdFx0XHRcdFx0XHRcdFx0YWRkUG9zaXRpb25zKHN0YXJ0LCB4Lm9yaWdpbmFsUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSlcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0dGV4dDogZ2V0VGV4dChtb2RpZmllZExpbmVzLCB4Lm1vZGlmaWVkUmFuZ2UpLmpvaW4obW9kZWwuZW9sKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1RoZSBleHBlcmltZW50YWwgZGlmZiBhbGdvcml0aG0gYWx3YXlzIHByb2R1Y2VzIGlubmVyIGNoYW5nZXMnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbGFzdEVvbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgZW9sOiBsYXN0RW9sLCB0ZXh0OiAnJywgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAwLCBzdGFydENvbHVtbjogMCwgZW5kTGluZU51bWJlcjogMCwgZW5kQ29sdW1uOiAwIH0gfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vIC0tLS0gRU5EIG1pbmltYWwgZWRpdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHVibGljIGFzeW5jICRjb21wdXRlTGlua3MobW9kZWxVcmw6IHN0cmluZyk6IFByb21pc2U8SUxpbmtbXSB8IG51bGw+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE1vZGVsKG1vZGVsVXJsKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcHV0ZUxpbmtzKG1vZGVsKTtcblx0fVxuXG5cdC8vIC0tLSBCRUdJTiBkZWZhdWx0IGRvY3VtZW50IGNvbG9ycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHB1YmxpYyBhc3luYyAkY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbFVybDogc3RyaW5nKTogUHJvbWlzZTxJQ29sb3JJbmZvcm1hdGlvbltdIHwgbnVsbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZ2V0TW9kZWwobW9kZWxVcmwpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cdH1cblxuXHQvLyAtLS0tIEJFR0lOIHN1Z2dlc3QgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc3VnZ2VzdGlvbnNMaW1pdCA9IDEwMDAwO1xuXG5cdHB1YmxpYyBhc3luYyAkdGV4dHVhbFN1Z2dlc3QobW9kZWxVcmxzOiBzdHJpbmdbXSwgbGVhZGluZ1dvcmQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgd29yZERlZjogc3RyaW5nLCB3b3JkRGVmRmxhZ3M6IHN0cmluZyk6IFByb21pc2U8eyB3b3Jkczogc3RyaW5nW107IGR1cmF0aW9uOiBudW1iZXIgfSB8IG51bGw+IHtcblxuXHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdGNvbnN0IHdvcmREZWZSZWdFeHAgPSBuZXcgUmVnRXhwKHdvcmREZWYsIHdvcmREZWZGbGFncyk7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0b3V0ZXI6IGZvciAoY29uc3QgdXJsIG9mIG1vZGVsVXJscykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbCh1cmwpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCB3b3JkIG9mIG1vZGVsLndvcmRzKHdvcmREZWZSZWdFeHApKSB7XG5cdFx0XHRcdGlmICh3b3JkID09PSBsZWFkaW5nV29yZCB8fCAhaXNOYU4oTnVtYmVyKHdvcmQpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW4uYWRkKHdvcmQpO1xuXHRcdFx0XHRpZiAoc2Vlbi5zaXplID4gRWRpdG9yV29ya2VyLl9zdWdnZXN0aW9uc0xpbWl0KSB7XG5cdFx0XHRcdFx0YnJlYWsgb3V0ZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB3b3JkczogQXJyYXkuZnJvbShzZWVuKSwgZHVyYXRpb246IHN3LmVsYXBzZWQoKSB9O1xuXHR9XG5cblxuXHQvLyAtLS0tIEVORCBzdWdnZXN0IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Ly8jcmVnaW9uIC0tIHdvcmQgcmFuZ2VzIC0tXG5cblx0cHVibGljIGFzeW5jICRjb21wdXRlV29yZFJhbmdlcyhtb2RlbFVybDogc3RyaW5nLCByYW5nZTogSVJhbmdlLCB3b3JkRGVmOiBzdHJpbmcsIHdvcmREZWZGbGFnczogc3RyaW5nKTogUHJvbWlzZTx7IFt3b3JkOiBzdHJpbmddOiBJUmFuZ2VbXSB9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbChtb2RlbFVybCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmREZWZSZWdFeHAgPSBuZXcgUmVnRXhwKHdvcmREZWYsIHdvcmREZWZGbGFncyk7XG5cdFx0Y29uc3QgcmVzdWx0OiB7IFt3b3JkOiBzdHJpbmddOiBJUmFuZ2VbXSB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGxldCBsaW5lID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBsaW5lIDwgcmFuZ2UuZW5kTGluZU51bWJlcjsgbGluZSsrKSB7XG5cdFx0XHRjb25zdCB3b3JkcyA9IG1vZGVsLmdldExpbmVXb3JkcyhsaW5lLCB3b3JkRGVmUmVnRXhwKTtcblx0XHRcdGZvciAoY29uc3Qgd29yZCBvZiB3b3Jkcykge1xuXHRcdFx0XHRpZiAoIWlzTmFOKE51bWJlcih3b3JkLndvcmQpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBhcnJheSA9IHJlc3VsdFt3b3JkLndvcmRdO1xuXHRcdFx0XHRpZiAoIWFycmF5KSB7XG5cdFx0XHRcdFx0YXJyYXkgPSBbXTtcblx0XHRcdFx0XHRyZXN1bHRbd29yZC53b3JkXSA9IGFycmF5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFycmF5LnB1c2goe1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogbGluZSxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogd29yZC5zdGFydENvbHVtbixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBsaW5lLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogd29yZC5lbmRDb2x1bW5cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwdWJsaWMgYXN5bmMgJG5hdmlnYXRlVmFsdWVTZXQobW9kZWxVcmw6IHN0cmluZywgcmFuZ2U6IElSYW5nZSwgdXA6IGJvb2xlYW4sIHdvcmREZWY6IHN0cmluZywgd29yZERlZkZsYWdzOiBzdHJpbmcpOiBQcm9taXNlPElJbnBsYWNlUmVwbGFjZVN1cHBvcnRSZXN1bHQgfCBudWxsPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbChtb2RlbFVybCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29yZERlZlJlZ0V4cCA9IG5ldyBSZWdFeHAod29yZERlZiwgd29yZERlZkZsYWdzKTtcblxuXHRcdGlmIChyYW5nZS5zdGFydENvbHVtbiA9PT0gcmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHRyYW5nZSA9IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogcmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0ZW5kQ29sdW1uOiByYW5nZS5lbmRDb2x1bW4gKyAxXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvblRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXG5cdFx0Y29uc3Qgd29yZFJhbmdlID0gbW9kZWwuZ2V0V29yZEF0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogcmFuZ2Uuc3RhcnRDb2x1bW4gfSwgd29yZERlZlJlZ0V4cCk7XG5cdFx0aWYgKCF3b3JkUmFuZ2UpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCB3b3JkID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHdvcmRSYW5nZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gQmFzaWNJbnBsYWNlUmVwbGFjZS5JTlNUQU5DRS5uYXZpZ2F0ZVZhbHVlU2V0KHJhbmdlLCBzZWxlY3Rpb25UZXh0LCB3b3JkUmFuZ2UsIHdvcmQsIHVwKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gLS0tLSBCRUdJTiBmb3JlaWduIG1vZHVsZSBzdXBwb3J0IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Ly8gZm9yZWlnbiBtZXRob2QgcmVxdWVzdFxuXHRwdWJsaWMgJGZtcihtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0aWYgKCF0aGlzLl9mb3JlaWduTW9kdWxlIHx8IHR5cGVvZiAodGhpcy5fZm9yZWlnbk1vZHVsZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbbWV0aG9kXSAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignTWlzc2luZyByZXF1ZXN0SGFuZGxlciBvciBtZXRob2Q6ICcgKyBtZXRob2QpKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgodGhpcy5fZm9yZWlnbk1vZHVsZSBhcyBSZWNvcmQ8c3RyaW5nLCBGdW5jdGlvbj4pW21ldGhvZF0uYXBwbHkodGhpcy5fZm9yZWlnbk1vZHVsZSwgYXJncykpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIEVORCBmb3JlaWduIG1vZHVsZSBzdXBwb3J0IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG59XG5cbi8vIFRoaXMgaXMgb25seSBhdmFpbGFibGUgaW4gYSBXZWIgV29ya2VyXG5kZWNsYXJlIGZ1bmN0aW9uIGltcG9ydFNjcmlwdHMoLi4udXJsczogc3RyaW5nW10pOiB2b2lkO1xuXG5pZiAodHlwZW9mIGltcG9ydFNjcmlwdHMgPT09ICdmdW5jdGlvbicpIHtcblx0Ly8gUnVubmluZyBpbiBhIHdlYiB3b3JrZXJcblx0Z2xvYmFsVGhpcy5tb25hY28gPSBjcmVhdGVNb25hY29CYXNlQVBJKCk7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVMaW5lc0RpZmZDb21wdXRlcihhbGdvcml0aG06IERpZmZBbGdvcml0aG1OYW1lKTogSUxpbmVzRGlmZkNvbXB1dGVyIHwgUHJvbWlzZTxJTGluZXNEaWZmQ29tcHV0ZXI+IHtcblx0c3dpdGNoIChhbGdvcml0aG0pIHtcblx0XHRjYXNlICdsZWdhY3knOiByZXR1cm4gbGluZXNEaWZmQ29tcHV0ZXJzLmdldExlZ2FjeSgpO1xuXHRcdGNhc2UgJ2FkdmFuY2VkJzogcmV0dXJuIGxpbmVzRGlmZkNvbXB1dGVycy5nZXREZWZhdWx0KCk7XG5cdFx0Y2FzZSAnYWR2YW5jZWQtZXh0ZXJuYWwnOiByZXR1cm4gbGluZXNEaWZmQ29tcHV0ZXJzLmdldEFkdmFuY2VkRXh0ZXJuYWwoKTtcblx0XHRjYXNlICdhZHZhbmNlZC13YXNtJzogcmV0dXJuIGxpbmVzRGlmZkNvbXB1dGVycy5nZXRBZHZhbmNlZFdhc20oKTtcblx0fVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21wdXRlU3RyaW5nRGlmZihvcmlnaW5hbDogc3RyaW5nLCBtb2RpZmllZDogc3RyaW5nLCBvcHRpb25zOiB7IG1heENvbXB1dGF0aW9uVGltZU1zOiBudW1iZXIgfSwgYWxnb3JpdGhtOiBEaWZmQWxnb3JpdGhtTmFtZSk6IFByb21pc2U8U3RyaW5nRWRpdD4ge1xuXHRjb25zdCBkaWZmQWxnb3JpdGhtID0gYXdhaXQgcmVzb2x2ZUxpbmVzRGlmZkNvbXB1dGVyKGFsZ29yaXRobSk7XG5cblx0ZW5zdXJlRGVwZW5kZW5jaWVzQXJlU2V0KCk7XG5cblx0Y29uc3Qgb3JpZ2luYWxUZXh0ID0gbmV3IFN0cmluZ1RleHQob3JpZ2luYWwpO1xuXHRjb25zdCBvcmlnaW5hbExpbmVzID0gb3JpZ2luYWxUZXh0LmdldExpbmVzKCk7XG5cdGNvbnN0IG1vZGlmaWVkVGV4dCA9IG5ldyBTdHJpbmdUZXh0KG1vZGlmaWVkKTtcblx0Y29uc3QgbW9kaWZpZWRMaW5lcyA9IG1vZGlmaWVkVGV4dC5nZXRMaW5lcygpO1xuXG5cdGNvbnN0IHJlc3VsdCA9IGRpZmZBbGdvcml0aG0uY29tcHV0ZURpZmYob3JpZ2luYWxMaW5lcywgbW9kaWZpZWRMaW5lcywgeyBpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsIG1heENvbXB1dGF0aW9uVGltZU1zOiBvcHRpb25zLm1heENvbXB1dGF0aW9uVGltZU1zLCBjb21wdXRlTW92ZXM6IGZhbHNlLCBleHRlbmRUb1N1YndvcmRzOiBmYWxzZSB9KTtcblxuXHRjb25zdCB0ZXh0RWRpdCA9IERldGFpbGVkTGluZVJhbmdlTWFwcGluZy50b1RleHRFZGl0KHJlc3VsdC5jaGFuZ2VzLCBtb2RpZmllZFRleHQpO1xuXHRjb25zdCBzdHJFZGl0ID0gb3JpZ2luYWxUZXh0LmdldFRyYW5zZm9ybWVyKCkuZ2V0U3RyaW5nRWRpdCh0ZXh0RWRpdCk7XG5cblx0cmV0dXJuIHN0ckVkaXQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUkzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFpQixhQUFhO0FBSTlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMs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
