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
import { coalesce } from "../../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { FindMatch } from "../../../../../editor/common/model.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { resultIsMatch } from "../../../../services/search/common/search.js";
import { getTextSearchMatchWithModelContext } from "../../../../services/search/common/searchHelpers.js";
import { FindMatchDecorationModel } from "../../../notebook/browser/contrib/find/findMatchDecorationModel.js";
import { CellFindMatchModel } from "../../../notebook/browser/contrib/find/findModel.js";
import { INotebookEditorService } from "../../../notebook/browser/services/notebookEditorService.js";
import { NotebookCellsChangeType } from "../../../notebook/common/notebookCommon.js";
import { CellSearchModel } from "../../common/cellSearchModel.js";
import { isINotebookFileMatchNoModel, rawCellPrefix } from "../../common/searchNotebookHelpers.js";
import { contentMatchesToTextSearchMatches, isINotebookCellMatchWithModel, isINotebookFileMatchWithModel, webviewMatchesToTextSearchMatches } from "./searchNotebookHelpers.js";
import { MATCH_PREFIX } from "../searchTreeModel/searchTreeCommon.js";
import { IReplaceService } from "../replace.js";
import { FileMatchImpl } from "../searchTreeModel/fileMatch.js";
import { isIMatchInNotebook } from "./notebookSearchModelBase.js";
import { MatchImpl, textSearchResultToMatches } from "../searchTreeModel/match.js";
class MatchInNotebook extends MatchImpl {
  constructor(_cellParent, _fullPreviewLines, _fullPreviewRange, _documentRange, webviewIndex) {
    super(_cellParent.parent, _fullPreviewLines, _fullPreviewRange, _documentRange, false);
    this._cellParent = _cellParent;
    this._id = MATCH_PREFIX + this._parent.resource.toString() + ">" + this._cellParent.cellIndex + (webviewIndex ? "_" + webviewIndex : "") + "_" + this.notebookMatchTypeString() + this._range + this.getMatchString();
    this._webviewIndex = webviewIndex;
  }
  parent() {
    return this._cellParent.parent;
  }
  get cellParent() {
    return this._cellParent;
  }
  notebookMatchTypeString() {
    return this.isWebviewMatch() ? "webview" : "content";
  }
  isWebviewMatch() {
    return this._webviewIndex !== void 0;
  }
  get isReadonly() {
    return super.isReadonly || !this._cellParent.hasCellViewModel() || this.isWebviewMatch();
  }
  get cellIndex() {
    return this._cellParent.cellIndex;
  }
  get webviewIndex() {
    return this._webviewIndex;
  }
  get cell() {
    return this._cellParent.cell;
  }
}
class CellMatch {
  constructor(_parent, _cell, _cellIndex) {
    this._parent = _parent;
    this._cell = _cell;
    this._cellIndex = _cellIndex;
    this._contentMatches = /* @__PURE__ */ new Map();
    this._webviewMatches = /* @__PURE__ */ new Map();
    this._context = /* @__PURE__ */ new Map();
  }
  hasCellViewModel() {
    return !(this._cell instanceof CellSearchModel);
  }
  get context() {
    return new Map(this._context);
  }
  matches() {
    return [...this._contentMatches.values(), ...this._webviewMatches.values()];
  }
  get contentMatches() {
    return Array.from(this._contentMatches.values());
  }
  get webviewMatches() {
    return Array.from(this._webviewMatches.values());
  }
  remove(matches) {
    if (!Array.isArray(matches)) {
      matches = [matches];
    }
    for (const match of matches) {
      this._contentMatches.delete(match.id());
      this._webviewMatches.delete(match.id());
    }
  }
  clearAllMatches() {
    this._contentMatches.clear();
    this._webviewMatches.clear();
  }
  addContentMatches(textSearchMatches) {
    const contentMatches = textSearchMatchesToNotebookMatches(textSearchMatches, this);
    contentMatches.forEach((match) => {
      this._contentMatches.set(match.id(), match);
    });
    this.addContext(textSearchMatches);
  }
  addContext(textSearchMatches) {
    if (!this.cell) {
      return;
    }
    this.cell.resolveTextModel().then((textModel) => {
      const textResultsWithContext = getTextSearchMatchWithModelContext(textSearchMatches, textModel, this.parent.parent().query);
      const contexts = textResultsWithContext.filter(((result) => !resultIsMatch(result)));
      contexts.map((context) => ({ ...context, lineNumber: context.lineNumber + 1 })).forEach((context) => {
        this._context.set(context.lineNumber, context.text);
      });
    });
  }
  addWebviewMatches(textSearchMatches) {
    const webviewMatches = textSearchMatchesToNotebookMatches(textSearchMatches, this);
    webviewMatches.forEach((match) => {
      this._webviewMatches.set(match.id(), match);
    });
  }
  setCellModel(cell) {
    this._cell = cell;
  }
  get parent() {
    return this._parent;
  }
  get id() {
    return this._cell?.id ?? `${rawCellPrefix}${this.cellIndex}`;
  }
  get cellIndex() {
    return this._cellIndex;
  }
  get cell() {
    return this._cell;
  }
}
let NotebookCompatibleFileMatch = class extends FileMatchImpl {
  constructor(_query, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, searchInstanceID, modelService, replaceService, labelService, notebookEditorService) {
    super(_query, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, modelService, replaceService, labelService);
    this.searchInstanceID = searchInstanceID;
    this.notebookEditorService = notebookEditorService;
    this._notebookEditorWidget = null;
    this._editorWidgetListener = null;
    this._cellMatches = /* @__PURE__ */ new Map();
    this._notebookUpdateScheduler = this._register(new RunOnceScheduler(this.updateMatchesForEditorWidget.bind(this), 250));
  }
  get cellContext() {
    const cellContext = /* @__PURE__ */ new Map();
    this._cellMatches.forEach((cellMatch) => {
      cellContext.set(cellMatch.id, cellMatch.context);
    });
    return cellContext;
  }
  getCellMatch(cellID) {
    return this._cellMatches.get(cellID);
  }
  addCellMatch(rawCell) {
    const cellMatch = new CellMatch(this, isINotebookCellMatchWithModel(rawCell) ? rawCell.cell : void 0, rawCell.index);
    this._cellMatches.set(cellMatch.id, cellMatch);
    this.addWebviewMatchesToCell(cellMatch.id, rawCell.webviewResults);
    this.addContentMatchesToCell(cellMatch.id, rawCell.contentResults);
  }
  addWebviewMatchesToCell(cellID, webviewMatches) {
    const cellMatch = this.getCellMatch(cellID);
    if (cellMatch !== void 0) {
      cellMatch.addWebviewMatches(webviewMatches);
    }
  }
  addContentMatchesToCell(cellID, contentMatches) {
    const cellMatch = this.getCellMatch(cellID);
    if (cellMatch !== void 0) {
      cellMatch.addContentMatches(contentMatches);
    }
  }
  revealCellRange(match, outputOffset) {
    if (!this._notebookEditorWidget || !match.cell) {
      return;
    }
    if (match.webviewIndex !== void 0) {
      const index = this._notebookEditorWidget.getCellIndex(match.cell);
      if (index !== void 0) {
        this._notebookEditorWidget.revealCellOffsetInCenter(match.cell, outputOffset ?? 0);
      }
    } else {
      match.cell.updateEditState(match.cell.getEditState(), "focusNotebookCell");
      this._notebookEditorWidget.setCellEditorSelection(match.cell, match.range());
      this._notebookEditorWidget.revealRangeInCenterIfOutsideViewportAsync(match.cell, match.range());
    }
  }
  bindNotebookEditorWidget(widget) {
    if (this._notebookEditorWidget === widget) {
      return;
    }
    this._notebookEditorWidget = widget;
    this._editorWidgetListener = this._notebookEditorWidget.textModel?.onDidChangeContent((e) => {
      if (!e.rawEvents.some((event) => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ModelChange)) {
        return;
      }
      this._notebookUpdateScheduler.schedule();
    }) ?? null;
    this._addNotebookHighlights();
  }
  unbindNotebookEditorWidget(widget) {
    if (widget && this._notebookEditorWidget !== widget) {
      return;
    }
    if (this._notebookEditorWidget) {
      this._notebookUpdateScheduler.cancel();
      this._editorWidgetListener?.dispose();
    }
    this._removeNotebookHighlights();
    this._notebookEditorWidget = null;
  }
  updateNotebookHighlights() {
    if (this.parent().showHighlights) {
      this._addNotebookHighlights();
      this.setNotebookFindMatchDecorationsUsingCellMatches(Array.from(this._cellMatches.values()));
    } else {
      this._removeNotebookHighlights();
    }
  }
  _addNotebookHighlights() {
    if (!this._notebookEditorWidget) {
      return;
    }
    this._findMatchDecorationModel?.stopWebviewFind();
    this._findMatchDecorationModel?.dispose();
    this._findMatchDecorationModel = new FindMatchDecorationModel(this._notebookEditorWidget, this.searchInstanceID);
    if (this._selectedMatch instanceof MatchInNotebook) {
      this.highlightCurrentFindMatchDecoration(this._selectedMatch);
    }
  }
  _removeNotebookHighlights() {
    if (this._findMatchDecorationModel) {
      this._findMatchDecorationModel?.stopWebviewFind();
      this._findMatchDecorationModel?.dispose();
      this._findMatchDecorationModel = void 0;
    }
  }
  updateNotebookMatches(matches, modelChange) {
    if (!this._notebookEditorWidget) {
      return;
    }
    const oldCellMatches = new Map(this._cellMatches);
    if (this._notebookEditorWidget.getId() !== this._lastEditorWidgetIdForUpdate) {
      this._cellMatches.clear();
      this._lastEditorWidgetIdForUpdate = this._notebookEditorWidget.getId();
    }
    matches.forEach((match) => {
      let existingCell = this._cellMatches.get(match.cell.id);
      if (this._notebookEditorWidget && !existingCell) {
        const index = this._notebookEditorWidget.getCellIndex(match.cell);
        const existingRawCell = oldCellMatches.get(`${rawCellPrefix}${index}`);
        if (existingRawCell) {
          existingRawCell.setCellModel(match.cell);
          existingRawCell.clearAllMatches();
          existingCell = existingRawCell;
        }
      }
      existingCell?.clearAllMatches();
      const cell = existingCell ?? new CellMatch(this, match.cell, match.index);
      cell.addContentMatches(contentMatchesToTextSearchMatches(match.contentMatches, match.cell));
      cell.addWebviewMatches(webviewMatchesToTextSearchMatches(match.webviewMatches));
      this._cellMatches.set(cell.id, cell);
    });
    this._findMatchDecorationModel?.setAllFindMatchesDecorations(matches);
    if (this._selectedMatch instanceof MatchInNotebook) {
      this.highlightCurrentFindMatchDecoration(this._selectedMatch);
    }
    this._onChange.fire({ forceUpdateModel: modelChange });
  }
  setNotebookFindMatchDecorationsUsingCellMatches(cells) {
    if (!this._findMatchDecorationModel) {
      return;
    }
    const cellFindMatch = coalesce(cells.map((cell) => {
      const webviewMatches = coalesce(cell.webviewMatches.map((match) => {
        if (!match.webviewIndex) {
          return void 0;
        }
        return {
          index: match.webviewIndex
        };
      }));
      if (!cell.cell) {
        return void 0;
      }
      const findMatches = cell.contentMatches.map((match) => {
        return new FindMatch(match.range(), [match.text()]);
      });
      return new CellFindMatchModel(cell.cell, cell.cellIndex, findMatches, webviewMatches);
    }));
    try {
      this._findMatchDecorationModel.setAllFindMatchesDecorations(cellFindMatch);
    } catch (e) {
    }
  }
  async updateMatchesForEditorWidget() {
    if (!this._notebookEditorWidget) {
      return;
    }
    this._textMatches = /* @__PURE__ */ new Map();
    const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
    const allMatches = await this._notebookEditorWidget.find(this._query.pattern, {
      regex: this._query.isRegExp,
      wholeWord: this._query.isWordMatch,
      caseSensitive: this._query.isCaseSensitive,
      wordSeparators: wordSeparators ?? void 0,
      includeMarkupInput: this._query.notebookInfo?.isInNotebookMarkdownInput,
      includeMarkupPreview: this._query.notebookInfo?.isInNotebookMarkdownPreview,
      includeCodeInput: this._query.notebookInfo?.isInNotebookCellInput,
      includeOutput: this._query.notebookInfo?.isInNotebookCellOutput
    }, CancellationToken.None, false, true, this.searchInstanceID);
    this.updateNotebookMatches(allMatches, true);
  }
  async showMatch(match) {
    const offset = await this.highlightCurrentFindMatchDecoration(match);
    this.setSelectedMatch(match);
    this.revealCellRange(match, offset);
  }
  async highlightCurrentFindMatchDecoration(match) {
    if (!this._findMatchDecorationModel || !match.cell) {
      return null;
    }
    if (match.webviewIndex === void 0) {
      return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInCell(match.cell, match.range());
    } else {
      return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInWebview(match.cell, match.webviewIndex);
    }
  }
  matches() {
    const matches = Array.from(this._cellMatches.values()).flatMap((e) => e.matches());
    return [...super.matches(), ...matches];
  }
  removeMatch(match) {
    if (match instanceof MatchInNotebook) {
      match.cellParent.remove(match);
      if (match.cellParent.matches().length === 0) {
        this._cellMatches.delete(match.cellParent.id);
      }
      if (this.isMatchSelected(match)) {
        this.setSelectedMatch(null);
        this._findMatchDecorationModel?.clearCurrentFindMatchDecoration();
      } else {
        this.updateHighlights();
      }
      this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
    } else {
      super.removeMatch(match);
    }
  }
  cellMatches() {
    return Array.from(this._cellMatches.values());
  }
  createMatches() {
    const model = this.modelService.getModel(this._resource);
    if (model) {
      this.bindModel(model);
      this.updateMatchesForModel();
    } else {
      const notebookEditorWidgetBorrow = this.notebookEditorService.retrieveExistingWidgetFromURI(this.resource);
      if (notebookEditorWidgetBorrow?.value) {
        this.bindNotebookEditorWidget(notebookEditorWidgetBorrow.value);
      }
      if (this.rawMatch.results) {
        this.rawMatch.results.filter(resultIsMatch).forEach((rawMatch) => {
          textSearchResultToMatches(rawMatch, this, false).forEach((m) => this.add(m));
        });
      }
      if (isINotebookFileMatchWithModel(this.rawMatch) || isINotebookFileMatchNoModel(this.rawMatch)) {
        this.rawMatch.cellResults?.forEach((cell) => this.addCellMatch(cell));
        this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
        this._onChange.fire({ forceUpdateModel: true });
      }
      this.addContext(this.rawMatch.results);
    }
  }
  get hasChildren() {
    return super.hasChildren || this._cellMatches.size > 0;
  }
  setSelectedMatch(match) {
    if (match) {
      if (!this.isMatchSelected(match) && isIMatchInNotebook(match)) {
        this._selectedMatch = match;
        return;
      }
      if (!this._textMatches.has(match.id())) {
        return;
      }
      if (this.isMatchSelected(match)) {
        return;
      }
    }
    this._selectedMatch = match;
    this.updateHighlights();
  }
  dispose() {
    this.unbindNotebookEditorWidget();
    super.dispose();
  }
};
NotebookCompatibleFileMatch = __decorateClass([
  __decorateParam(7, IModelService),
  __decorateParam(8, IReplaceService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, INotebookEditorService)
], NotebookCompatibleFileMatch);
function textSearchMatchesToNotebookMatches(textSearchMatches, cell) {
  const notebookMatches = [];
  textSearchMatches.forEach((textSearchMatch) => {
    const previewLines = textSearchMatch.previewText.split("\n");
    textSearchMatch.rangeLocations.map((rangeLocation) => {
      const previewRange = rangeLocation.preview;
      const match = new MatchInNotebook(cell, previewLines, previewRange, rangeLocation.source, textSearchMatch.webviewIndex);
      notebookMatches.push(match);
    });
  });
  return notebookMatches;
}
export {
  CellMatch,
  MatchInNotebook,
  NotebookCompatibleFileMatch,
  textSearchMatchesToNotebookMatches
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcbm90ZWJvb2tTZWFyY2hcXG5vdGVib29rU2VhcmNoTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElTZWFyY2hSYW5nZSwgSVRleHRTZWFyY2hNYXRjaCwgcmVzdWx0SXNNYXRjaCwgSVRleHRTZWFyY2hDb250ZXh0LCBJUGF0dGVybkluZm8sIElUZXh0U2VhcmNoUHJldmlld09wdGlvbnMsIElGaWxlTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBnZXRUZXh0U2VhcmNoTWF0Y2hXaXRoTW9kZWxDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2hIZWxwZXJzLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaERlY29yYXRpb25Nb2RlbCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9maW5kL2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsRmluZE1hdGNoTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvZmluZC9maW5kTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEZpbmRNYXRjaFdpdGhJbmRleCwgQ2VsbFdlYnZpZXdGaW5kTWF0Y2gsIElDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDZWxsU2VhcmNoTW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vY2VsbFNlYXJjaE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxNYXRjaE5vTW9kZWwsIGlzSU5vdGVib29rRmlsZU1hdGNoTm9Nb2RlbCwgcmF3Q2VsbFByZWZpeCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZWFyY2hOb3RlYm9va0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgY29udGVudE1hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzLCBJTm90ZWJvb2tDZWxsTWF0Y2hXaXRoTW9kZWwsIGlzSU5vdGVib29rQ2VsbE1hdGNoV2l0aE1vZGVsLCBpc0lOb3RlYm9va0ZpbGVNYXRjaFdpdGhNb2RlbCwgd2Vidmlld01hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzIH0gZnJvbSAnLi9zZWFyY2hOb3RlYm9va0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFRyZWVNYXRjaCwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaCwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QsIE1BVENIX1BSRUZJWCB9IGZyb20gJy4uL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hUcmVlQ29tbW9uLmpzJztcbmltcG9ydCB7IElSZXBsYWNlU2VydmljZSB9IGZyb20gJy4uL3JlcGxhY2UuanMnO1xuaW1wb3J0IHsgRmlsZU1hdGNoSW1wbCB9IGZyb20gJy4uL3NlYXJjaFRyZWVNb2RlbC9maWxlTWF0Y2guanMnO1xuaW1wb3J0IHsgSUNlbGxNYXRjaCwgSU1hdGNoSW5Ob3RlYm9vaywgSU5vdGVib29rRmlsZUluc3RhbmNlTWF0Y2gsIGlzSU1hdGNoSW5Ob3RlYm9vayB9IGZyb20gJy4vbm90ZWJvb2tTZWFyY2hNb2RlbEJhc2UuanMnO1xuaW1wb3J0IHsgTWF0Y2hJbXBsLCB0ZXh0U2VhcmNoUmVzdWx0VG9NYXRjaGVzIH0gZnJvbSAnLi4vc2VhcmNoVHJlZU1vZGVsL21hdGNoLmpzJztcblxuZXhwb3J0IGNsYXNzIE1hdGNoSW5Ob3RlYm9vayBleHRlbmRzIE1hdGNoSW1wbCBpbXBsZW1lbnRzIElNYXRjaEluTm90ZWJvb2sge1xuXHRwcml2YXRlIF93ZWJ2aWV3SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9jZWxsUGFyZW50OiBJQ2VsbE1hdGNoLCBfZnVsbFByZXZpZXdMaW5lczogc3RyaW5nW10sIF9mdWxsUHJldmlld1JhbmdlOiBJU2VhcmNoUmFuZ2UsIF9kb2N1bWVudFJhbmdlOiBJU2VhcmNoUmFuZ2UsIHdlYnZpZXdJbmRleD86IG51bWJlcikge1xuXHRcdHN1cGVyKF9jZWxsUGFyZW50LnBhcmVudCwgX2Z1bGxQcmV2aWV3TGluZXMsIF9mdWxsUHJldmlld1JhbmdlLCBfZG9jdW1lbnRSYW5nZSwgZmFsc2UpO1xuXHRcdHRoaXMuX2lkID0gTUFUQ0hfUFJFRklYICsgdGhpcy5fcGFyZW50LnJlc291cmNlLnRvU3RyaW5nKCkgKyAnPicgKyB0aGlzLl9jZWxsUGFyZW50LmNlbGxJbmRleCArICh3ZWJ2aWV3SW5kZXggPyAnXycgKyB3ZWJ2aWV3SW5kZXggOiAnJykgKyAnXycgKyB0aGlzLm5vdGVib29rTWF0Y2hUeXBlU3RyaW5nKCkgKyB0aGlzLl9yYW5nZSArIHRoaXMuZ2V0TWF0Y2hTdHJpbmcoKTtcblx0XHR0aGlzLl93ZWJ2aWV3SW5kZXggPSB3ZWJ2aWV3SW5kZXg7XG5cdH1cblxuXHRvdmVycmlkZSBwYXJlbnQoKTogSU5vdGVib29rRmlsZUluc3RhbmNlTWF0Y2ggeyAvLyB2aXNpYmxlIHBhcmVudCBpbiBzZWFyY2ggdHJlZVxuXHRcdHJldHVybiB0aGlzLl9jZWxsUGFyZW50LnBhcmVudDtcblx0fVxuXG5cdGdldCBjZWxsUGFyZW50KCk6IElDZWxsTWF0Y2gge1xuXHRcdHJldHVybiB0aGlzLl9jZWxsUGFyZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBub3RlYm9va01hdGNoVHlwZVN0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlzV2Vidmlld01hdGNoKCkgPyAnd2VidmlldycgOiAnY29udGVudCc7XG5cdH1cblxuXHRwdWJsaWMgaXNXZWJ2aWV3TWF0Y2goKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dlYnZpZXdJbmRleCAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGlzUmVhZG9ubHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHN1cGVyLmlzUmVhZG9ubHkgfHwgKCF0aGlzLl9jZWxsUGFyZW50Lmhhc0NlbGxWaWV3TW9kZWwoKSkgfHwgdGhpcy5pc1dlYnZpZXdNYXRjaCgpO1xuXHR9XG5cblx0Z2V0IGNlbGxJbmRleCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY2VsbFBhcmVudC5jZWxsSW5kZXg7XG5cdH1cblxuXHRnZXQgd2Vidmlld0luZGV4KCkge1xuXHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3SW5kZXg7XG5cdH1cblxuXHRnZXQgY2VsbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY2VsbFBhcmVudC5jZWxsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDZWxsTWF0Y2ggaW1wbGVtZW50cyBJQ2VsbE1hdGNoIHtcblx0cHJpdmF0ZSBfY29udGVudE1hdGNoZXM6IE1hcDxzdHJpbmcsIE1hdGNoSW5Ob3RlYm9vaz47XG5cdHByaXZhdGUgX3dlYnZpZXdNYXRjaGVzOiBNYXA8c3RyaW5nLCBNYXRjaEluTm90ZWJvb2s+O1xuXHRwcml2YXRlIF9jb250ZXh0OiBNYXA8bnVtYmVyLCBzdHJpbmc+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudDogSU5vdGVib29rRmlsZUluc3RhbmNlTWF0Y2gsXG5cdFx0cHJpdmF0ZSBfY2VsbDogSUNlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2VsbEluZGV4OiBudW1iZXIsXG5cdCkge1xuXG5cdFx0dGhpcy5fY29udGVudE1hdGNoZXMgPSBuZXcgTWFwPHN0cmluZywgTWF0Y2hJbk5vdGVib29rPigpO1xuXHRcdHRoaXMuX3dlYnZpZXdNYXRjaGVzID0gbmV3IE1hcDxzdHJpbmcsIE1hdGNoSW5Ob3RlYm9vaz4oKTtcblx0XHR0aGlzLl9jb250ZXh0ID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblx0fVxuXG5cdHB1YmxpYyBoYXNDZWxsVmlld01vZGVsKCkge1xuXHRcdHJldHVybiAhKHRoaXMuX2NlbGwgaW5zdGFuY2VvZiBDZWxsU2VhcmNoTW9kZWwpO1xuXHR9XG5cblx0Z2V0IGNvbnRleHQoKTogTWFwPG51bWJlciwgc3RyaW5nPiB7XG5cdFx0cmV0dXJuIG5ldyBNYXAodGhpcy5fY29udGV4dCk7XG5cdH1cblxuXHRtYXRjaGVzKCkge1xuXHRcdHJldHVybiBbLi4udGhpcy5fY29udGVudE1hdGNoZXMudmFsdWVzKCksIC4uLiB0aGlzLl93ZWJ2aWV3TWF0Y2hlcy52YWx1ZXMoKV07XG5cdH1cblxuXHRnZXQgY29udGVudE1hdGNoZXMoKTogTWF0Y2hJbk5vdGVib29rW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2NvbnRlbnRNYXRjaGVzLnZhbHVlcygpKTtcblx0fVxuXG5cdGdldCB3ZWJ2aWV3TWF0Y2hlcygpOiBNYXRjaEluTm90ZWJvb2tbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fd2Vidmlld01hdGNoZXMudmFsdWVzKCkpO1xuXHR9XG5cblx0cmVtb3ZlKG1hdGNoZXM6IE1hdGNoSW5Ob3RlYm9vayB8IE1hdGNoSW5Ob3RlYm9va1tdKTogdm9pZCB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG5cdFx0XHRtYXRjaGVzID0gW21hdGNoZXNdO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRcdHRoaXMuX2NvbnRlbnRNYXRjaGVzLmRlbGV0ZShtYXRjaC5pZCgpKTtcblx0XHRcdHRoaXMuX3dlYnZpZXdNYXRjaGVzLmRlbGV0ZShtYXRjaC5pZCgpKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhckFsbE1hdGNoZXMoKSB7XG5cdFx0dGhpcy5fY29udGVudE1hdGNoZXMuY2xlYXIoKTtcblx0XHR0aGlzLl93ZWJ2aWV3TWF0Y2hlcy5jbGVhcigpO1xuXHR9XG5cblx0YWRkQ29udGVudE1hdGNoZXModGV4dFNlYXJjaE1hdGNoZXM6IElUZXh0U2VhcmNoTWF0Y2hbXSkge1xuXHRcdGNvbnN0IGNvbnRlbnRNYXRjaGVzID0gdGV4dFNlYXJjaE1hdGNoZXNUb05vdGVib29rTWF0Y2hlcyh0ZXh0U2VhcmNoTWF0Y2hlcywgdGhpcyk7XG5cdFx0Y29udGVudE1hdGNoZXMuZm9yRWFjaCgobWF0Y2gpID0+IHtcblx0XHRcdHRoaXMuX2NvbnRlbnRNYXRjaGVzLnNldChtYXRjaC5pZCgpLCBtYXRjaCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5hZGRDb250ZXh0KHRleHRTZWFyY2hNYXRjaGVzKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRDb250ZXh0KHRleHRTZWFyY2hNYXRjaGVzOiBJVGV4dFNlYXJjaE1hdGNoW10pIHtcblx0XHRpZiAoIXRoaXMuY2VsbCkge1xuXHRcdFx0Ly8gdG9kbzogZ2V0IGNsb3NlZCBub3RlYm9vayByZXN1bHRzIGluIHNlYXJjaCBlZGl0b3Jcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jZWxsLnJlc29sdmVUZXh0TW9kZWwoKS50aGVuKCh0ZXh0TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IHRleHRSZXN1bHRzV2l0aENvbnRleHQgPSBnZXRUZXh0U2VhcmNoTWF0Y2hXaXRoTW9kZWxDb250ZXh0KHRleHRTZWFyY2hNYXRjaGVzLCB0ZXh0TW9kZWwsIHRoaXMucGFyZW50LnBhcmVudCgpLnF1ZXJ5ISk7XG5cdFx0XHRjb25zdCBjb250ZXh0cyA9IHRleHRSZXN1bHRzV2l0aENvbnRleHQuZmlsdGVyKChyZXN1bHQgPT4gIXJlc3VsdElzTWF0Y2gocmVzdWx0KSkgYXMgKChhOiBhbnkpID0+IGEgaXMgSVRleHRTZWFyY2hDb250ZXh0KSk7XG5cdFx0XHRjb250ZXh0cy5tYXAoY29udGV4dCA9PiAoeyAuLi5jb250ZXh0LCBsaW5lTnVtYmVyOiBjb250ZXh0LmxpbmVOdW1iZXIgKyAxIH0pKVxuXHRcdFx0XHQuZm9yRWFjaCgoY29udGV4dCkgPT4geyB0aGlzLl9jb250ZXh0LnNldChjb250ZXh0LmxpbmVOdW1iZXIsIGNvbnRleHQudGV4dCk7IH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0YWRkV2Vidmlld01hdGNoZXModGV4dFNlYXJjaE1hdGNoZXM6IElUZXh0U2VhcmNoTWF0Y2hbXSkge1xuXHRcdGNvbnN0IHdlYnZpZXdNYXRjaGVzID0gdGV4dFNlYXJjaE1hdGNoZXNUb05vdGVib29rTWF0Y2hlcyh0ZXh0U2VhcmNoTWF0Y2hlcywgdGhpcyk7XG5cdFx0d2Vidmlld01hdGNoZXMuZm9yRWFjaCgobWF0Y2gpID0+IHtcblx0XHRcdHRoaXMuX3dlYnZpZXdNYXRjaGVzLnNldChtYXRjaC5pZCgpLCBtYXRjaCk7XG5cdFx0fSk7XG5cdFx0Ly8gVE9ETzogYWRkIHdlYnZpZXcgcmVzdWx0cyB0byBjb250ZXh0XG5cdH1cblxuXG5cdHNldENlbGxNb2RlbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHRoaXMuX2NlbGwgPSBjZWxsO1xuXHR9XG5cblx0Z2V0IHBhcmVudCgpOiBJTm90ZWJvb2tGaWxlSW5zdGFuY2VNYXRjaCB7XG5cdFx0cmV0dXJuIHRoaXMuX3BhcmVudDtcblx0fVxuXG5cdGdldCBpZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jZWxsPy5pZCA/PyBgJHtyYXdDZWxsUHJlZml4fSR7dGhpcy5jZWxsSW5kZXh9YDtcblx0fVxuXG5cdGdldCBjZWxsSW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY2VsbEluZGV4O1xuXHR9XG5cblx0Z2V0IGNlbGwoKTogSUNlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jZWxsO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQ29tcGF0aWJsZUZpbGVNYXRjaCBleHRlbmRzIEZpbGVNYXRjaEltcGwgaW1wbGVtZW50cyBJTm90ZWJvb2tGaWxlSW5zdGFuY2VNYXRjaCB7XG5cblxuXHRwcml2YXRlIF9ub3RlYm9va0VkaXRvcldpZGdldDogTm90ZWJvb2tFZGl0b3JXaWRnZXQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfZWRpdG9yV2lkZ2V0TGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX25vdGVib29rVXBkYXRlU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIF9sYXN0RWRpdG9yV2lkZ2V0SWRGb3JVcGRhdGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfcXVlcnk6IElQYXR0ZXJuSW5mbyxcblx0XHRfcHJldmlld09wdGlvbnM6IElUZXh0U2VhcmNoUHJldmlld09wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0X21heFJlc3VsdHM6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRfcGFyZW50OiBJU2VhcmNoVHJlZUZvbGRlck1hdGNoLFxuXHRcdHJhd01hdGNoOiBJRmlsZU1hdGNoLFxuXHRcdF9jbG9zZXN0Um9vdDogSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QgfCBudWxsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoSW5zdGFuY2VJRDogc3RyaW5nLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVJlcGxhY2VTZXJ2aWNlIHJlcGxhY2VTZXJ2aWNlOiBJUmVwbGFjZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3JTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihfcXVlcnksIF9wcmV2aWV3T3B0aW9ucywgX21heFJlc3VsdHMsIF9wYXJlbnQsIHJhd01hdGNoLCBfY2xvc2VzdFJvb3QsIG1vZGVsU2VydmljZSwgcmVwbGFjZVNlcnZpY2UsIGxhYmVsU2VydmljZSk7XG5cdFx0dGhpcy5fY2VsbE1hdGNoZXMgPSBuZXcgTWFwPHN0cmluZywgSUNlbGxNYXRjaD4oKTtcblx0XHR0aGlzLl9ub3RlYm9va1VwZGF0ZVNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKHRoaXMudXBkYXRlTWF0Y2hlc0ZvckVkaXRvcldpZGdldC5iaW5kKHRoaXMpLCAyNTApKTtcblx0fVxuXHRwcml2YXRlIF9jZWxsTWF0Y2hlczogTWFwPHN0cmluZywgSUNlbGxNYXRjaD47XG5cdHB1YmxpYyBnZXQgY2VsbENvbnRleHQoKTogTWFwPHN0cmluZywgTWFwPG51bWJlciwgc3RyaW5nPj4ge1xuXHRcdGNvbnN0IGNlbGxDb250ZXh0ID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIHN0cmluZz4+KCk7XG5cdFx0dGhpcy5fY2VsbE1hdGNoZXMuZm9yRWFjaChjZWxsTWF0Y2ggPT4ge1xuXHRcdFx0Y2VsbENvbnRleHQuc2V0KGNlbGxNYXRjaC5pZCwgY2VsbE1hdGNoLmNvbnRleHQpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBjZWxsQ29udGV4dDtcblx0fVxuXG5cdGdldENlbGxNYXRjaChjZWxsSUQ6IHN0cmluZyk6IElDZWxsTWF0Y2ggfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jZWxsTWF0Y2hlcy5nZXQoY2VsbElEKTtcblx0fVxuXG5cdGFkZENlbGxNYXRjaChyYXdDZWxsOiBJTm90ZWJvb2tDZWxsTWF0Y2hOb01vZGVsIHwgSU5vdGVib29rQ2VsbE1hdGNoV2l0aE1vZGVsKSB7XG5cdFx0Y29uc3QgY2VsbE1hdGNoID0gbmV3IENlbGxNYXRjaCh0aGlzLCBpc0lOb3RlYm9va0NlbGxNYXRjaFdpdGhNb2RlbChyYXdDZWxsKSA/IHJhd0NlbGwuY2VsbCA6IHVuZGVmaW5lZCwgcmF3Q2VsbC5pbmRleCk7XG5cdFx0dGhpcy5fY2VsbE1hdGNoZXMuc2V0KGNlbGxNYXRjaC5pZCwgY2VsbE1hdGNoKTtcblx0XHR0aGlzLmFkZFdlYnZpZXdNYXRjaGVzVG9DZWxsKGNlbGxNYXRjaC5pZCwgcmF3Q2VsbC53ZWJ2aWV3UmVzdWx0cyk7XG5cdFx0dGhpcy5hZGRDb250ZW50TWF0Y2hlc1RvQ2VsbChjZWxsTWF0Y2guaWQsIHJhd0NlbGwuY29udGVudFJlc3VsdHMpO1xuXHR9XG5cblx0YWRkV2Vidmlld01hdGNoZXNUb0NlbGwoY2VsbElEOiBzdHJpbmcsIHdlYnZpZXdNYXRjaGVzOiBJVGV4dFNlYXJjaE1hdGNoW10pIHtcblx0XHRjb25zdCBjZWxsTWF0Y2ggPSB0aGlzLmdldENlbGxNYXRjaChjZWxsSUQpO1xuXHRcdGlmIChjZWxsTWF0Y2ggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2VsbE1hdGNoLmFkZFdlYnZpZXdNYXRjaGVzKHdlYnZpZXdNYXRjaGVzKTtcblx0XHR9XG5cdH1cblxuXHRhZGRDb250ZW50TWF0Y2hlc1RvQ2VsbChjZWxsSUQ6IHN0cmluZywgY29udGVudE1hdGNoZXM6IElUZXh0U2VhcmNoTWF0Y2hbXSkge1xuXHRcdGNvbnN0IGNlbGxNYXRjaCA9IHRoaXMuZ2V0Q2VsbE1hdGNoKGNlbGxJRCk7XG5cdFx0aWYgKGNlbGxNYXRjaCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjZWxsTWF0Y2guYWRkQ29udGVudE1hdGNoZXMoY29udGVudE1hdGNoZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmV2ZWFsQ2VsbFJhbmdlKG1hdGNoOiBNYXRjaEluTm90ZWJvb2ssIG91dHB1dE9mZnNldDogbnVtYmVyIHwgbnVsbCkge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQgfHwgIW1hdGNoLmNlbGwpIHtcblx0XHRcdC8vIG1hdGNoIGNlbGwgc2hvdWxkIG5ldmVyIGJlIGEgQ2VsbFNlYXJjaE1vZGVsIGlmIHRoZSBub3RlYm9vayBpcyBvcGVuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChtYXRjaC53ZWJ2aWV3SW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9ub3RlYm9va0VkaXRvcldpZGdldC5nZXRDZWxsSW5kZXgobWF0Y2guY2VsbCk7XG5cdFx0XHRpZiAoaW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvcldpZGdldC5yZXZlYWxDZWxsT2Zmc2V0SW5DZW50ZXIobWF0Y2guY2VsbCwgb3V0cHV0T2Zmc2V0ID8/IDApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRtYXRjaC5jZWxsLnVwZGF0ZUVkaXRTdGF0ZShtYXRjaC5jZWxsLmdldEVkaXRTdGF0ZSgpLCAnZm9jdXNOb3RlYm9va0NlbGwnKTtcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yV2lkZ2V0LnNldENlbGxFZGl0b3JTZWxlY3Rpb24obWF0Y2guY2VsbCwgbWF0Y2gucmFuZ2UoKSk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvcldpZGdldC5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnRBc3luYyhtYXRjaC5jZWxsLCBtYXRjaC5yYW5nZSgpKTtcblx0XHR9XG5cdH1cblxuXG5cdGJpbmROb3RlYm9va0VkaXRvcldpZGdldCh3aWRnZXQ6IE5vdGVib29rRWRpdG9yV2lkZ2V0KSB7XG5cdFx0aWYgKHRoaXMuX25vdGVib29rRWRpdG9yV2lkZ2V0ID09PSB3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvcldpZGdldCA9IHdpZGdldDtcblxuXHRcdHRoaXMuX2VkaXRvcldpZGdldExpc3RlbmVyID0gdGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQudGV4dE1vZGVsPy5vbkRpZENoYW5nZUNvbnRlbnQoKGUpID0+IHtcblx0XHRcdGlmICghZS5yYXdFdmVudHMuc29tZShldmVudCA9PiBldmVudC5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsQ29udGVudCB8fCBldmVudC5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbm90ZWJvb2tVcGRhdGVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KSA/PyBudWxsO1xuXHRcdHRoaXMuX2FkZE5vdGVib29rSGlnaGxpZ2h0cygpO1xuXHR9XG5cblx0dW5iaW5kTm90ZWJvb2tFZGl0b3JXaWRnZXQod2lkZ2V0PzogTm90ZWJvb2tFZGl0b3JXaWRnZXQpIHtcblx0XHRpZiAod2lkZ2V0ICYmIHRoaXMuX25vdGVib29rRWRpdG9yV2lkZ2V0ICE9PSB3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHRoaXMuX25vdGVib29rVXBkYXRlU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0TGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVtb3ZlTm90ZWJvb2tIaWdobGlnaHRzKCk7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQgPSBudWxsO1xuXHR9XG5cblx0dXBkYXRlTm90ZWJvb2tIaWdobGlnaHRzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBhcmVudCgpLnNob3dIaWdobGlnaHRzKSB7XG5cdFx0XHR0aGlzLl9hZGROb3RlYm9va0hpZ2hsaWdodHMoKTtcblx0XHRcdHRoaXMuc2V0Tm90ZWJvb2tGaW5kTWF0Y2hEZWNvcmF0aW9uc1VzaW5nQ2VsbE1hdGNoZXMoQXJyYXkuZnJvbSh0aGlzLl9jZWxsTWF0Y2hlcy52YWx1ZXMoKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVOb3RlYm9va0hpZ2hsaWdodHMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGROb3RlYm9va0hpZ2hsaWdodHMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvcldpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWw/LnN0b3BXZWJ2aWV3RmluZCgpO1xuXHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbCA9IG5ldyBGaW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwodGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQsIHRoaXMuc2VhcmNoSW5zdGFuY2VJRCk7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGVkTWF0Y2ggaW5zdGFuY2VvZiBNYXRjaEluTm90ZWJvb2spIHtcblx0XHRcdHRoaXMuaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb24odGhpcy5fc2VsZWN0ZWRNYXRjaCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlTm90ZWJvb2tIaWdobGlnaHRzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwpIHtcblx0XHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbD8uc3RvcFdlYnZpZXdGaW5kKCk7XG5cdFx0XHR0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWw/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU5vdGVib29rTWF0Y2hlcyhtYXRjaGVzOiBDZWxsRmluZE1hdGNoV2l0aEluZGV4W10sIG1vZGVsQ2hhbmdlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvcldpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZENlbGxNYXRjaGVzID0gbmV3IE1hcDxzdHJpbmcsIElDZWxsTWF0Y2g+KHRoaXMuX2NlbGxNYXRjaGVzKTtcblx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQuZ2V0SWQoKSAhPT0gdGhpcy5fbGFzdEVkaXRvcldpZGdldElkRm9yVXBkYXRlKSB7XG5cdFx0XHR0aGlzLl9jZWxsTWF0Y2hlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fbGFzdEVkaXRvcldpZGdldElkRm9yVXBkYXRlID0gdGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQuZ2V0SWQoKTtcblx0XHR9XG5cdFx0bWF0Y2hlcy5mb3JFYWNoKG1hdGNoID0+IHtcblx0XHRcdGxldCBleGlzdGluZ0NlbGwgPSB0aGlzLl9jZWxsTWF0Y2hlcy5nZXQobWF0Y2guY2VsbC5pZCk7XG5cdFx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQgJiYgIWV4aXN0aW5nQ2VsbCkge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX25vdGVib29rRWRpdG9yV2lkZ2V0LmdldENlbGxJbmRleChtYXRjaC5jZWxsKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdSYXdDZWxsID0gb2xkQ2VsbE1hdGNoZXMuZ2V0KGAke3Jhd0NlbGxQcmVmaXh9JHtpbmRleH1gKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nUmF3Q2VsbCkge1xuXHRcdFx0XHRcdGV4aXN0aW5nUmF3Q2VsbC5zZXRDZWxsTW9kZWwobWF0Y2guY2VsbCk7XG5cdFx0XHRcdFx0ZXhpc3RpbmdSYXdDZWxsLmNsZWFyQWxsTWF0Y2hlcygpO1xuXHRcdFx0XHRcdGV4aXN0aW5nQ2VsbCA9IGV4aXN0aW5nUmF3Q2VsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZXhpc3RpbmdDZWxsPy5jbGVhckFsbE1hdGNoZXMoKTtcblx0XHRcdGNvbnN0IGNlbGwgPSBleGlzdGluZ0NlbGwgPz8gbmV3IENlbGxNYXRjaCh0aGlzLCBtYXRjaC5jZWxsLCBtYXRjaC5pbmRleCk7XG5cdFx0XHRjZWxsLmFkZENvbnRlbnRNYXRjaGVzKGNvbnRlbnRNYXRjaGVzVG9UZXh0U2VhcmNoTWF0Y2hlcyhtYXRjaC5jb250ZW50TWF0Y2hlcywgbWF0Y2guY2VsbCkpO1xuXHRcdFx0Y2VsbC5hZGRXZWJ2aWV3TWF0Y2hlcyh3ZWJ2aWV3TWF0Y2hlc1RvVGV4dFNlYXJjaE1hdGNoZXMobWF0Y2gud2Vidmlld01hdGNoZXMpKTtcblx0XHRcdHRoaXMuX2NlbGxNYXRjaGVzLnNldChjZWxsLmlkLCBjZWxsKTtcblxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsPy5zZXRBbGxGaW5kTWF0Y2hlc0RlY29yYXRpb25zKG1hdGNoZXMpO1xuXHRcdGlmICh0aGlzLl9zZWxlY3RlZE1hdGNoIGluc3RhbmNlb2YgTWF0Y2hJbk5vdGVib29rKSB7XG5cdFx0XHR0aGlzLmhpZ2hsaWdodEN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKHRoaXMuX3NlbGVjdGVkTWF0Y2gpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgZm9yY2VVcGRhdGVNb2RlbDogbW9kZWxDaGFuZ2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIHNldE5vdGVib29rRmluZE1hdGNoRGVjb3JhdGlvbnNVc2luZ0NlbGxNYXRjaGVzKGNlbGxzOiBJQ2VsbE1hdGNoW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsRmluZE1hdGNoID0gY29hbGVzY2UoY2VsbHMubWFwKChjZWxsKTogQ2VsbEZpbmRNYXRjaE1vZGVsIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IHdlYnZpZXdNYXRjaGVzOiBDZWxsV2Vidmlld0ZpbmRNYXRjaFtdID0gY29hbGVzY2UoY2VsbC53ZWJ2aWV3TWF0Y2hlcy5tYXAoKG1hdGNoKTogQ2VsbFdlYnZpZXdGaW5kTWF0Y2ggfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRpZiAoIW1hdGNoLndlYnZpZXdJbmRleCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbmRleDogbWF0Y2gud2Vidmlld0luZGV4LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXHRcdFx0aWYgKCFjZWxsLmNlbGwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbmRNYXRjaGVzOiBGaW5kTWF0Y2hbXSA9IGNlbGwuY29udGVudE1hdGNoZXMubWFwKG1hdGNoID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBGaW5kTWF0Y2gobWF0Y2gucmFuZ2UoKSwgW21hdGNoLnRleHQoKV0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gbmV3IENlbGxGaW5kTWF0Y2hNb2RlbChjZWxsLmNlbGwsIGNlbGwuY2VsbEluZGV4LCBmaW5kTWF0Y2hlcywgd2Vidmlld01hdGNoZXMpO1xuXHRcdH0pKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLnNldEFsbEZpbmRNYXRjaGVzRGVjb3JhdGlvbnMoY2VsbEZpbmRNYXRjaCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gbm8gb3AsIG1pZ2h0IGhhcHBlbiBkdWUgdG8gYnVncyByZWxhdGVkIHRvIGNlbGwgb3V0cHV0IHJlZ2V4IHNlYXJjaFxuXHRcdH1cblx0fVxuXHRhc3luYyB1cGRhdGVNYXRjaGVzRm9yRWRpdG9yV2lkZ2V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90ZXh0TWF0Y2hlcyA9IG5ldyBNYXA8c3RyaW5nLCBJU2VhcmNoVHJlZU1hdGNoPigpO1xuXG5cdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSB0aGlzLl9xdWVyeS5pc1dvcmRNYXRjaCAmJiB0aGlzLl9xdWVyeS53b3JkU2VwYXJhdG9ycyA/IHRoaXMuX3F1ZXJ5LndvcmRTZXBhcmF0b3JzIDogbnVsbDtcblx0XHRjb25zdCBhbGxNYXRjaGVzID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tFZGl0b3JXaWRnZXRcblx0XHRcdC5maW5kKHRoaXMuX3F1ZXJ5LnBhdHRlcm4sIHtcblx0XHRcdFx0cmVnZXg6IHRoaXMuX3F1ZXJ5LmlzUmVnRXhwLFxuXHRcdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX3F1ZXJ5LmlzV29yZE1hdGNoLFxuXHRcdFx0XHRjYXNlU2Vuc2l0aXZlOiB0aGlzLl9xdWVyeS5pc0Nhc2VTZW5zaXRpdmUsXG5cdFx0XHRcdHdvcmRTZXBhcmF0b3JzOiB3b3JkU2VwYXJhdG9ycyA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdGluY2x1ZGVNYXJrdXBJbnB1dDogdGhpcy5fcXVlcnkubm90ZWJvb2tJbmZvPy5pc0luTm90ZWJvb2tNYXJrZG93bklucHV0LFxuXHRcdFx0XHRpbmNsdWRlTWFya3VwUHJldmlldzogdGhpcy5fcXVlcnkubm90ZWJvb2tJbmZvPy5pc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcsXG5cdFx0XHRcdGluY2x1ZGVDb2RlSW5wdXQ6IHRoaXMuX3F1ZXJ5Lm5vdGVib29rSW5mbz8uaXNJbk5vdGVib29rQ2VsbElucHV0LFxuXHRcdFx0XHRpbmNsdWRlT3V0cHV0OiB0aGlzLl9xdWVyeS5ub3RlYm9va0luZm8/LmlzSW5Ob3RlYm9va0NlbGxPdXRwdXQsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBmYWxzZSwgdHJ1ZSwgdGhpcy5zZWFyY2hJbnN0YW5jZUlEKTtcblxuXHRcdHRoaXMudXBkYXRlTm90ZWJvb2tNYXRjaGVzKGFsbE1hdGNoZXMsIHRydWUpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNob3dNYXRjaChtYXRjaDogTWF0Y2hJbk5vdGVib29rKSB7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0gYXdhaXQgdGhpcy5oaWdobGlnaHRDdXJyZW50RmluZE1hdGNoRGVjb3JhdGlvbihtYXRjaCk7XG5cdFx0dGhpcy5zZXRTZWxlY3RlZE1hdGNoKG1hdGNoKTtcblx0XHR0aGlzLnJldmVhbENlbGxSYW5nZShtYXRjaCwgb2Zmc2V0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb24obWF0Y2g6IE1hdGNoSW5Ob3RlYm9vayk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsIHx8ICFtYXRjaC5jZWxsKSB7XG5cdFx0XHQvLyBtYXRjaCBjZWxsIHNob3VsZCBuZXZlciBiZSBhIENlbGxTZWFyY2hNb2RlbCBpZiB0aGUgbm90ZWJvb2sgaXMgb3BlblxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChtYXRjaC53ZWJ2aWV3SW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5oaWdobGlnaHRDdXJyZW50RmluZE1hdGNoRGVjb3JhdGlvbkluQ2VsbChtYXRjaC5jZWxsLCBtYXRjaC5yYW5nZSgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5oaWdobGlnaHRDdXJyZW50RmluZE1hdGNoRGVjb3JhdGlvbkluV2VidmlldyhtYXRjaC5jZWxsLCBtYXRjaC53ZWJ2aWV3SW5kZXgpO1xuXHRcdH1cblx0fVxuXG5cblx0b3ZlcnJpZGUgbWF0Y2hlcygpOiBJU2VhcmNoVHJlZU1hdGNoW10ge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSBBcnJheS5mcm9tKHRoaXMuX2NlbGxNYXRjaGVzLnZhbHVlcygpKS5mbGF0TWFwKChlKSA9PiBlLm1hdGNoZXMoKSk7XG5cdFx0cmV0dXJuIFsuLi5zdXBlci5tYXRjaGVzKCksIC4uLm1hdGNoZXNdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbW92ZU1hdGNoKG1hdGNoOiBJU2VhcmNoVHJlZU1hdGNoKSB7XG5cblx0XHRpZiAobWF0Y2ggaW5zdGFuY2VvZiBNYXRjaEluTm90ZWJvb2spIHtcblx0XHRcdG1hdGNoLmNlbGxQYXJlbnQucmVtb3ZlKG1hdGNoKTtcblx0XHRcdGlmIChtYXRjaC5jZWxsUGFyZW50Lm1hdGNoZXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fY2VsbE1hdGNoZXMuZGVsZXRlKG1hdGNoLmNlbGxQYXJlbnQuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5pc01hdGNoU2VsZWN0ZWQobWF0Y2gpKSB7XG5cdFx0XHRcdHRoaXMuc2V0U2VsZWN0ZWRNYXRjaChudWxsKTtcblx0XHRcdFx0dGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsPy5jbGVhckN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUhpZ2hsaWdodHMoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXROb3RlYm9va0ZpbmRNYXRjaERlY29yYXRpb25zVXNpbmdDZWxsTWF0Y2hlcyh0aGlzLmNlbGxNYXRjaGVzKCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci5yZW1vdmVNYXRjaChtYXRjaCk7XG5cdFx0fVxuXHR9XG5cblx0Y2VsbE1hdGNoZXMoKTogSUNlbGxNYXRjaFtdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9jZWxsTWF0Y2hlcy52YWx1ZXMoKSk7XG5cdH1cblxuXG5cdG92ZXJyaWRlIGNyZWF0ZU1hdGNoZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbCh0aGlzLl9yZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHQvLyB0b2RvOiBoYW5kbGUgYmV0dGVyIHdoZW4gYWkgY29udHJpYnV0ZWQgcmVzdWx0cyBoYXMgbW9kZWwsIGN1cnJlbnRseSwgY3JlYXRlTWF0Y2hlcyBkb2VzIG5vdCB3b3JrIGZvciB0aGlzXG5cdFx0XHR0aGlzLmJpbmRNb2RlbChtb2RlbCk7XG5cdFx0XHR0aGlzLnVwZGF0ZU1hdGNoZXNGb3JNb2RlbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBub3RlYm9va0VkaXRvcldpZGdldEJvcnJvdyA9IHRoaXMubm90ZWJvb2tFZGl0b3JTZXJ2aWNlLnJldHJpZXZlRXhpc3RpbmdXaWRnZXRGcm9tVVJJKHRoaXMucmVzb3VyY2UpO1xuXG5cdFx0XHRpZiAobm90ZWJvb2tFZGl0b3JXaWRnZXRCb3Jyb3c/LnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuYmluZE5vdGVib29rRWRpdG9yV2lkZ2V0KG5vdGVib29rRWRpdG9yV2lkZ2V0Qm9ycm93LnZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJhd01hdGNoLnJlc3VsdHMpIHtcblx0XHRcdFx0dGhpcy5yYXdNYXRjaC5yZXN1bHRzXG5cdFx0XHRcdFx0LmZpbHRlcihyZXN1bHRJc01hdGNoKVxuXHRcdFx0XHRcdC5mb3JFYWNoKHJhd01hdGNoID0+IHtcblx0XHRcdFx0XHRcdHRleHRTZWFyY2hSZXN1bHRUb01hdGNoZXMocmF3TWF0Y2gsIHRoaXMsIGZhbHNlKVxuXHRcdFx0XHRcdFx0XHQuZm9yRWFjaChtID0+IHRoaXMuYWRkKG0pKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzSU5vdGVib29rRmlsZU1hdGNoV2l0aE1vZGVsKHRoaXMucmF3TWF0Y2gpIHx8IGlzSU5vdGVib29rRmlsZU1hdGNoTm9Nb2RlbCh0aGlzLnJhd01hdGNoKSkge1xuXHRcdFx0XHR0aGlzLnJhd01hdGNoLmNlbGxSZXN1bHRzPy5mb3JFYWNoKGNlbGwgPT4gdGhpcy5hZGRDZWxsTWF0Y2goY2VsbCkpO1xuXHRcdFx0XHR0aGlzLnNldE5vdGVib29rRmluZE1hdGNoRGVjb3JhdGlvbnNVc2luZ0NlbGxNYXRjaGVzKHRoaXMuY2VsbE1hdGNoZXMoKSk7XG5cdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBmb3JjZVVwZGF0ZU1vZGVsOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5hZGRDb250ZXh0KHRoaXMucmF3TWF0Y2gucmVzdWx0cyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzdXBlci5oYXNDaGlsZHJlbiB8fCB0aGlzLl9jZWxsTWF0Y2hlcy5zaXplID4gMDtcblx0fVxuXG5cdG92ZXJyaWRlIHNldFNlbGVjdGVkTWF0Y2gobWF0Y2g6IElTZWFyY2hUcmVlTWF0Y2ggfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRpZiAoIXRoaXMuaXNNYXRjaFNlbGVjdGVkKG1hdGNoKSAmJiBpc0lNYXRjaEluTm90ZWJvb2sobWF0Y2gpKSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGVkTWF0Y2ggPSBtYXRjaDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX3RleHRNYXRjaGVzLmhhcyhtYXRjaC5pZCgpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pc01hdGNoU2VsZWN0ZWQobWF0Y2gpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9zZWxlY3RlZE1hdGNoID0gbWF0Y2g7XG5cdFx0dGhpcy51cGRhdGVIaWdobGlnaHRzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMudW5iaW5kTm90ZWJvb2tFZGl0b3JXaWRnZXQoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxufVxuLy8gdGV4dCBzZWFyY2ggdG8gbm90ZWJvb2sgbWF0Y2hlc1xuXG5leHBvcnQgZnVuY3Rpb24gdGV4dFNlYXJjaE1hdGNoZXNUb05vdGVib29rTWF0Y2hlcyh0ZXh0U2VhcmNoTWF0Y2hlczogSVRleHRTZWFyY2hNYXRjaFtdLCBjZWxsOiBDZWxsTWF0Y2gpOiBNYXRjaEluTm90ZWJvb2tbXSB7XG5cdGNvbnN0IG5vdGVib29rTWF0Y2hlczogTWF0Y2hJbk5vdGVib29rW10gPSBbXTtcblx0dGV4dFNlYXJjaE1hdGNoZXMuZm9yRWFjaCgodGV4dFNlYXJjaE1hdGNoKSA9PiB7XG5cdFx0Y29uc3QgcHJldmlld0xpbmVzID0gdGV4dFNlYXJjaE1hdGNoLnByZXZpZXdUZXh0LnNwbGl0KCdcXG4nKTtcblx0XHR0ZXh0U2VhcmNoTWF0Y2gucmFuZ2VMb2NhdGlvbnMubWFwKChyYW5nZUxvY2F0aW9uKSA9PiB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmFuZ2U6IElTZWFyY2hSYW5nZSA9IHJhbmdlTG9jYXRpb24ucHJldmlldztcblx0XHRcdGNvbnN0IG1hdGNoID0gbmV3IE1hdGNoSW5Ob3RlYm9vayhjZWxsLCBwcmV2aWV3TGluZXMsIHByZXZpZXdSYW5nZSwgcmFuZ2VMb2NhdGlvbi5zb3VyY2UsIHRleHRTZWFyY2hNYXRjaC53ZWJ2aWV3SW5kZXgpO1xuXHRcdFx0bm90ZWJvb2tNYXRjaGVzLnB1c2gobWF0Y2gpO1xuXHRcdH0pO1xuXHR9KTtcblx0cmV0dXJuIG5vdGVib29rTWF0Y2hlcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBeUMscUJBQThGO0FBQ3ZJLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBR25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW9DLDZCQUE2QixxQkFBcUI7QUFDdEYsU0FBUyxtQ0FBZ0UsK0JBQStCLCtCQUErQix5Q0FBeUM7QUFDaEwsU0FBd0Ysb0JBQW9CO0FBQzVHLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW1FLDBCQUEwQjtBQUM3RixTQUFTLFdBQVcsaUNBQWlDO0FBRTlDLE1BQU0sd0JBQXdCLFVBQXNDO0FBQUEsRUFHMUUsWUFBNkIsYUFBeUIsbUJBQTZCLG1CQUFpQyxnQkFBOEIsY0FBdUI7QUFDeEssVUFBTSxZQUFZLFFBQVEsbUJBQW1CLG1CQUFtQixnQkFBZ0IsS0FBSztBQUR6RDtBQUU1QixTQUFLLE1BQU0sZUFBZSxLQUFLLFFBQVEsU0FBUyxTQUFTLElBQUksTUFBTSxLQUFLLFlBQVksYUFBYSxlQUFlLE1BQU0sZUFBZSxNQUFNLE1BQU0sS0FBSyx3QkFBd0IsSUFBSSxLQUFLLFNBQVMsS0FBSyxlQUFlO0FBQ3BOLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQSxFQUVTLFNBQXFDO0FBQzdDLFdBQU8sS0FBSyxZQUFZO0FBQUEsRUFDekI7QUFBQSxFQUVBLElBQUksYUFBeUI7QUFDNUIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsMEJBQWtDO0FBQ3pDLFdBQU8sS0FBSyxlQUFlLElBQUksWUFBWTtBQUFBLEVBQzVDO0FBQUEsRUFFTyxpQkFBaUI7QUFDdkIsV0FBTyxLQUFLLGtCQUFrQjtBQUFBLEVBQy9CO0FBQUEsRUFFQSxJQUFhLGFBQXNCO0FBQ2xDLFdBQU8sTUFBTSxjQUFlLENBQUMsS0FBSyxZQUFZLGlCQUFpQixLQUFNLEtBQUssZUFBZTtBQUFBLEVBQzFGO0FBQUEsRUFFQSxJQUFJLFlBQVk7QUFDZixXQUFPLEtBQUssWUFBWTtBQUFBLEVBQ3pCO0FBQUEsRUFFQSxJQUFJLGVBQWU7QUFDbEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxPQUFPO0FBQ1YsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUN6QjtBQUNEO0FBRU8sTUFBTSxVQUFnQztBQUFBLEVBSzVDLFlBQ2tCLFNBQ1QsT0FDUyxZQUNoQjtBQUhnQjtBQUNUO0FBQ1M7QUFHakIsU0FBSyxrQkFBa0Isb0JBQUksSUFBNkI7QUFDeEQsU0FBSyxrQkFBa0Isb0JBQUksSUFBNkI7QUFDeEQsU0FBSyxXQUFXLG9CQUFJLElBQW9CO0FBQUEsRUFDekM7QUFBQSxFQUVPLG1CQUFtQjtBQUN6QixXQUFPLEVBQUUsS0FBSyxpQkFBaUI7QUFBQSxFQUNoQztBQUFBLEVBRUEsSUFBSSxVQUErQjtBQUNsQyxXQUFPLElBQUksSUFBSSxLQUFLLFFBQVE7QUFBQSxFQUM3QjtBQUFBLEVBRUEsVUFBVTtBQUNULFdBQU8sQ0FBQyxHQUFHLEtBQUssZ0JBQWdCLE9BQU8sR0FBRyxHQUFJLEtBQUssZ0JBQWdCLE9BQU8sQ0FBQztBQUFBLEVBQzVFO0FBQUEsRUFFQSxJQUFJLGlCQUFvQztBQUN2QyxXQUFPLE1BQU0sS0FBSyxLQUFLLGdCQUFnQixPQUFPLENBQUM7QUFBQSxFQUNoRDtBQUFBLEVBRUEsSUFBSSxpQkFBb0M7QUFDdkMsV0FBTyxNQUFNLEtBQUssS0FBSyxnQkFBZ0IsT0FBTyxDQUFDO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLE9BQU8sU0FBb0Q7QUFDMUQsUUFBSSxDQUFDLE1BQU0sUUFBUSxPQUFPLEdBQUc7QUFDNUIsZ0JBQVUsQ0FBQyxPQUFPO0FBQUEsSUFDbkI7QUFDQSxlQUFXLFNBQVMsU0FBUztBQUM1QixXQUFLLGdCQUFnQixPQUFPLE1BQU0sR0FBRyxDQUFDO0FBQ3RDLFdBQUssZ0JBQWdCLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLGtCQUFrQjtBQUNqQixTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFNBQUssZ0JBQWdCLE1BQU07QUFBQSxFQUM1QjtBQUFBLEVBRUEsa0JBQWtCLG1CQUF1QztBQUN4RCxVQUFNLGlCQUFpQixtQ0FBbUMsbUJBQW1CLElBQUk7QUFDakYsbUJBQWUsUUFBUSxDQUFDLFVBQVU7QUFDakMsV0FBSyxnQkFBZ0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxLQUFLO0FBQUEsSUFDM0MsQ0FBQztBQUNELFNBQUssV0FBVyxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRU8sV0FBVyxtQkFBdUM7QUFDeEQsUUFBSSxDQUFDLEtBQUssTUFBTTtBQUVmO0FBQUEsSUFDRDtBQUNBLFNBQUssS0FBSyxpQkFBaUIsRUFBRSxLQUFLLENBQUMsY0FBYztBQUNoRCxZQUFNLHlCQUF5QixtQ0FBbUMsbUJBQW1CLFdBQVcsS0FBSyxPQUFPLE9BQU8sRUFBRSxLQUFNO0FBQzNILFlBQU0sV0FBVyx1QkFBdUIsUUFBUSxZQUFVLENBQUMsY0FBYyxNQUFNLEVBQTJDO0FBQzFILGVBQVMsSUFBSSxjQUFZLEVBQUUsR0FBRyxTQUFTLFlBQVksUUFBUSxhQUFhLEVBQUUsRUFBRSxFQUMxRSxRQUFRLENBQUMsWUFBWTtBQUFFLGFBQUssU0FBUyxJQUFJLFFBQVEsWUFBWSxRQUFRLElBQUk7QUFBQSxNQUFHLENBQUM7QUFBQSxJQUNoRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsa0JBQWtCLG1CQUF1QztBQUN4RCxVQUFNLGlCQUFpQixtQ0FBbUMsbUJBQW1CLElBQUk7QUFDakYsbUJBQWUsUUFBUSxDQUFDLFVBQVU7QUFDakMsV0FBSyxnQkFBZ0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxLQUFLO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBRUY7QUFBQSxFQUdBLGFBQWEsTUFBc0I7QUFDbEMsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRUEsSUFBSSxTQUFxQztBQUN4QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLEtBQWE7QUFDaEIsV0FBTyxLQUFLLE9BQU8sTUFBTSxHQUFHLGFBQWEsR0FBRyxLQUFLLFNBQVM7QUFBQSxFQUMzRDtBQUFBLEVBRUEsSUFBSSxZQUFvQjtBQUN2QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLE9BQW1DO0FBQ3RDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFFRDtBQUVPLElBQU0sOEJBQU4sY0FBMEMsY0FBb0Q7QUFBQSxFQVFwRyxZQUNDLFFBQ0EsaUJBQ0EsYUFDQSxTQUNBLFVBQ0EsY0FDaUIsa0JBQ0YsY0FDRSxnQkFDRixjQUMwQix1QkFDeEM7QUFDRCxVQUFNLFFBQVEsaUJBQWlCLGFBQWEsU0FBUyxVQUFVLGNBQWMsY0FBYyxnQkFBZ0IsWUFBWTtBQU50RztBQUl3QjtBQWhCMUMsU0FBUSx3QkFBcUQ7QUFDN0QsU0FBUSx3QkFBNEM7QUFrQm5ELFNBQUssZUFBZSxvQkFBSSxJQUF3QjtBQUNoRCxTQUFLLDJCQUEyQixLQUFLLFVBQVUsSUFBSSxpQkFBaUIsS0FBSyw2QkFBNkIsS0FBSyxJQUFJLEdBQUcsR0FBRyxDQUFDO0FBQUEsRUFDdkg7QUFBQSxFQUVBLElBQVcsY0FBZ0Q7QUFDMUQsVUFBTSxjQUFjLG9CQUFJLElBQWlDO0FBQ3pELFNBQUssYUFBYSxRQUFRLGVBQWE7QUFDdEMsa0JBQVksSUFBSSxVQUFVLElBQUksVUFBVSxPQUFPO0FBQUEsSUFDaEQsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxhQUFhLFFBQXdDO0FBQ3BELFdBQU8sS0FBSyxhQUFhLElBQUksTUFBTTtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxhQUFhLFNBQWtFO0FBQzlFLFVBQU0sWUFBWSxJQUFJLFVBQVUsTUFBTSw4QkFBOEIsT0FBTyxJQUFJLFFBQVEsT0FBTyxRQUFXLFFBQVEsS0FBSztBQUN0SCxTQUFLLGFBQWEsSUFBSSxVQUFVLElBQUksU0FBUztBQUM3QyxTQUFLLHdCQUF3QixVQUFVLElBQUksUUFBUSxjQUFjO0FBQ2pFLFNBQUssd0JBQXdCLFVBQVUsSUFBSSxRQUFRLGNBQWM7QUFBQSxFQUNsRTtBQUFBLEVBRUEsd0JBQXdCLFFBQWdCLGdCQUFvQztBQUMzRSxVQUFNLFlBQVksS0FBSyxhQUFhLE1BQU07QUFDMUMsUUFBSSxjQUFjLFFBQVc7QUFDNUIsZ0JBQVUsa0JBQWtCLGNBQWM7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLHdCQUF3QixRQUFnQixnQkFBb0M7QUFDM0UsVUFBTSxZQUFZLEtBQUssYUFBYSxNQUFNO0FBQzFDLFFBQUksY0FBYyxRQUFXO0FBQzVCLGdCQUFVLGtCQUFrQixjQUFjO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsT0FBd0IsY0FBNkI7QUFDNUUsUUFBSSxDQUFDLEtBQUsseUJBQXlCLENBQUMsTUFBTSxNQUFNO0FBRS9DO0FBQUEsSUFDRDtBQUNBLFFBQUksTUFBTSxpQkFBaUIsUUFBVztBQUNyQyxZQUFNLFFBQVEsS0FBSyxzQkFBc0IsYUFBYSxNQUFNLElBQUk7QUFDaEUsVUFBSSxVQUFVLFFBQVc7QUFDeEIsYUFBSyxzQkFBc0IseUJBQXlCLE1BQU0sTUFBTSxnQkFBZ0IsQ0FBQztBQUFBLE1BQ2xGO0FBQUEsSUFDRCxPQUFPO0FBQ04sWUFBTSxLQUFLLGdCQUFnQixNQUFNLEtBQUssYUFBYSxHQUFHLG1CQUFtQjtBQUN6RSxXQUFLLHNCQUFzQix1QkFBdUIsTUFBTSxNQUFNLE1BQU0sTUFBTSxDQUFDO0FBQzNFLFdBQUssc0JBQXNCLDBDQUEwQyxNQUFNLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFBQSxJQUMvRjtBQUFBLEVBQ0Q7QUFBQSxFQUdBLHlCQUF5QixRQUE4QjtBQUN0RCxRQUFJLEtBQUssMEJBQTBCLFFBQVE7QUFDMUM7QUFBQSxJQUNEO0FBRUEsU0FBSyx3QkFBd0I7QUFFN0IsU0FBSyx3QkFBd0IsS0FBSyxzQkFBc0IsV0FBVyxtQkFBbUIsQ0FBQyxNQUFNO0FBQzVGLFVBQUksQ0FBQyxFQUFFLFVBQVUsS0FBSyxXQUFTLE1BQU0sU0FBUyx3QkFBd0IscUJBQXFCLE1BQU0sU0FBUyx3QkFBd0IsV0FBVyxHQUFHO0FBQy9JO0FBQUEsTUFDRDtBQUNBLFdBQUsseUJBQXlCLFNBQVM7QUFBQSxJQUN4QyxDQUFDLEtBQUs7QUFDTixTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFFQSwyQkFBMkIsUUFBK0I7QUFDekQsUUFBSSxVQUFVLEtBQUssMEJBQTBCLFFBQVE7QUFDcEQ7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLHVCQUF1QjtBQUMvQixXQUFLLHlCQUF5QixPQUFPO0FBQ3JDLFdBQUssdUJBQXVCLFFBQVE7QUFBQSxJQUNyQztBQUNBLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssd0JBQXdCO0FBQUEsRUFDOUI7QUFBQSxFQUVBLDJCQUFpQztBQUNoQyxRQUFJLEtBQUssT0FBTyxFQUFFLGdCQUFnQjtBQUNqQyxXQUFLLHVCQUF1QjtBQUM1QixXQUFLLGdEQUFnRCxNQUFNLEtBQUssS0FBSyxhQUFhLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDNUYsT0FBTztBQUNOLFdBQUssMEJBQTBCO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBK0I7QUFDdEMsUUFBSSxDQUFDLEtBQUssdUJBQXVCO0FBQ2hDO0FBQUEsSUFDRDtBQUNBLFNBQUssMkJBQTJCLGdCQUFnQjtBQUNoRCxTQUFLLDJCQUEyQixRQUFRO0FBQ3hDLFNBQUssNEJBQTRCLElBQUkseUJBQXlCLEtBQUssdUJBQXVCLEtBQUssZ0JBQWdCO0FBQy9HLFFBQUksS0FBSywwQkFBMEIsaUJBQWlCO0FBQ25ELFdBQUssb0NBQW9DLEtBQUssY0FBYztBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUFBLEVBRVEsNEJBQWtDO0FBQ3pDLFFBQUksS0FBSywyQkFBMkI7QUFDbkMsV0FBSywyQkFBMkIsZ0JBQWdCO0FBQ2hELFdBQUssMkJBQTJCLFFBQVE7QUFDeEMsV0FBSyw0QkFBNEI7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixTQUFtQyxhQUE0QjtBQUM1RixRQUFJLENBQUMsS0FBSyx1QkFBdUI7QUFDaEM7QUFBQSxJQUNEO0FBRUEsVUFBTSxpQkFBaUIsSUFBSSxJQUF3QixLQUFLLFlBQVk7QUFDcEUsUUFBSSxLQUFLLHNCQUFzQixNQUFNLE1BQU0sS0FBSyw4QkFBOEI7QUFDN0UsV0FBSyxhQUFhLE1BQU07QUFDeEIsV0FBSywrQkFBK0IsS0FBSyxzQkFBc0IsTUFBTTtBQUFBLElBQ3RFO0FBQ0EsWUFBUSxRQUFRLFdBQVM7QUFDeEIsVUFBSSxlQUFlLEtBQUssYUFBYSxJQUFJLE1BQU0sS0FBSyxFQUFFO0FBQ3RELFVBQUksS0FBSyx5QkFBeUIsQ0FBQyxjQUFjO0FBQ2hELGNBQU0sUUFBUSxLQUFLLHNCQUFzQixhQUFhLE1BQU0sSUFBSTtBQUNoRSxjQUFNLGtCQUFrQixlQUFlLElBQUksR0FBRyxhQUFhLEdBQUcsS0FBSyxFQUFFO0FBQ3JFLFlBQUksaUJBQWlCO0FBQ3BCLDBCQUFnQixhQUFhLE1BQU0sSUFBSTtBQUN2QywwQkFBZ0IsZ0JBQWdCO0FBQ2hDLHlCQUFlO0FBQUEsUUFDaEI7QUFBQSxNQUNEO0FBQ0Esb0JBQWMsZ0JBQWdCO0FBQzlCLFlBQU0sT0FBTyxnQkFBZ0IsSUFBSSxVQUFVLE1BQU0sTUFBTSxNQUFNLE1BQU0sS0FBSztBQUN4RSxXQUFLLGtCQUFrQixrQ0FBa0MsTUFBTSxnQkFBZ0IsTUFBTSxJQUFJLENBQUM7QUFDMUYsV0FBSyxrQkFBa0Isa0NBQWtDLE1BQU0sY0FBYyxDQUFDO0FBQzlFLFdBQUssYUFBYSxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQUEsSUFFcEMsQ0FBQztBQUVELFNBQUssMkJBQTJCLDZCQUE2QixPQUFPO0FBQ3BFLFFBQUksS0FBSywwQkFBMEIsaUJBQWlCO0FBQ25ELFdBQUssb0NBQW9DLEtBQUssY0FBYztBQUFBLElBQzdEO0FBQ0EsU0FBSyxVQUFVLEtBQUssRUFBRSxrQkFBa0IsWUFBWSxDQUFDO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLGdEQUFnRCxPQUEyQjtBQUNsRixRQUFJLENBQUMsS0FBSywyQkFBMkI7QUFDcEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxnQkFBZ0IsU0FBUyxNQUFNLElBQUksQ0FBQyxTQUF5QztBQUNsRixZQUFNLGlCQUF5QyxTQUFTLEtBQUssZUFBZSxJQUFJLENBQUMsVUFBNEM7QUFDNUgsWUFBSSxDQUFDLE1BQU0sY0FBYztBQUN4QixpQkFBTztBQUFBLFFBQ1I7QUFDQSxlQUFPO0FBQUEsVUFDTixPQUFPLE1BQU07QUFBQSxRQUNkO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDRixVQUFJLENBQUMsS0FBSyxNQUFNO0FBQ2YsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLGNBQTJCLEtBQUssZUFBZSxJQUFJLFdBQVM7QUFDakUsZUFBTyxJQUFJLFVBQVUsTUFBTSxNQUFNLEdBQUcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDbkQsQ0FBQztBQUNELGFBQU8sSUFBSSxtQkFBbUIsS0FBSyxNQUFNLEtBQUssV0FBVyxhQUFhLGNBQWM7QUFBQSxJQUNyRixDQUFDLENBQUM7QUFDRixRQUFJO0FBQ0gsV0FBSywwQkFBMEIsNkJBQTZCLGFBQWE7QUFBQSxJQUMxRSxTQUFTLEdBQUc7QUFBQSxJQUVaO0FBQUEsRUFDRDtBQUFBLEVBQ0EsTUFBTSwrQkFBOEM7QUFDbkQsUUFBSSxDQUFDLEtBQUssdUJBQXVCO0FBQ2hDO0FBQUEsSUFDRDtBQUVBLFNBQUssZUFBZSxvQkFBSSxJQUE4QjtBQUV0RCxVQUFNLGlCQUFpQixLQUFLLE9BQU8sZUFBZSxLQUFLLE9BQU8saUJBQWlCLEtBQUssT0FBTyxpQkFBaUI7QUFDNUcsVUFBTSxhQUFhLE1BQU0sS0FBSyxzQkFDNUIsS0FBSyxLQUFLLE9BQU8sU0FBUztBQUFBLE1BQzFCLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDbkIsV0FBVyxLQUFLLE9BQU87QUFBQSxNQUN2QixlQUFlLEtBQUssT0FBTztBQUFBLE1BQzNCLGdCQUFnQixrQkFBa0I7QUFBQSxNQUNsQyxvQkFBb0IsS0FBSyxPQUFPLGNBQWM7QUFBQSxNQUM5QyxzQkFBc0IsS0FBSyxPQUFPLGNBQWM7QUFBQSxNQUNoRCxrQkFBa0IsS0FBSyxPQUFPLGNBQWM7QUFBQSxNQUM1QyxlQUFlLEtBQUssT0FBTyxjQUFjO0FBQUEsSUFDMUMsR0FBRyxrQkFBa0IsTUFBTSxPQUFPLE1BQU0sS0FBSyxnQkFBZ0I7QUFFOUQsU0FBSyxzQkFBc0IsWUFBWSxJQUFJO0FBQUEsRUFDNUM7QUFBQSxFQUVBLE1BQWEsVUFBVSxPQUF3QjtBQUM5QyxVQUFNLFNBQVMsTUFBTSxLQUFLLG9DQUFvQyxLQUFLO0FBQ25FLFNBQUssaUJBQWlCLEtBQUs7QUFDM0IsU0FBSyxnQkFBZ0IsT0FBTyxNQUFNO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE1BQWMsb0NBQW9DLE9BQWdEO0FBQ2pHLFFBQUksQ0FBQyxLQUFLLDZCQUE2QixDQUFDLE1BQU0sTUFBTTtBQUVuRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksTUFBTSxpQkFBaUIsUUFBVztBQUNyQyxhQUFPLEtBQUssMEJBQTBCLDBDQUEwQyxNQUFNLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFBQSxJQUMxRyxPQUFPO0FBQ04sYUFBTyxLQUFLLDBCQUEwQiw2Q0FBNkMsTUFBTSxNQUFNLE1BQU0sWUFBWTtBQUFBLElBQ2xIO0FBQUEsRUFDRDtBQUFBLEVBR1MsVUFBOEI7QUFDdEMsVUFBTSxVQUFVLE1BQU0sS0FBSyxLQUFLLGFBQWEsT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUM7QUFDakYsV0FBTyxDQUFDLEdBQUcsTUFBTSxRQUFRLEdBQUcsR0FBRyxPQUFPO0FBQUEsRUFDdkM7QUFBQSxFQUVtQixZQUFZLE9BQXlCO0FBRXZELFFBQUksaUJBQWlCLGlCQUFpQjtBQUNyQyxZQUFNLFdBQVcsT0FBTyxLQUFLO0FBQzdCLFVBQUksTUFBTSxXQUFXLFFBQVEsRUFBRSxXQUFXLEdBQUc7QUFDNUMsYUFBSyxhQUFhLE9BQU8sTUFBTSxXQUFXLEVBQUU7QUFBQSxNQUM3QztBQUVBLFVBQUksS0FBSyxnQkFBZ0IsS0FBSyxHQUFHO0FBQ2hDLGFBQUssaUJBQWlCLElBQUk7QUFDMUIsYUFBSywyQkFBMkIsZ0NBQWdDO0FBQUEsTUFDakUsT0FBTztBQUNOLGFBQUssaUJBQWlCO0FBQUEsTUFDdkI7QUFFQSxXQUFLLGdEQUFnRCxLQUFLLFlBQVksQ0FBQztBQUFBLElBQ3hFLE9BQU87QUFDTixZQUFNLFlBQVksS0FBSztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBNEI7QUFDM0IsV0FBTyxNQUFNLEtBQUssS0FBSyxhQUFhLE9BQU8sQ0FBQztBQUFBLEVBQzdDO0FBQUEsRUFHUyxnQkFBc0I7QUFDOUIsVUFBTSxRQUFRLEtBQUssYUFBYSxTQUFTLEtBQUssU0FBUztBQUN2RCxRQUFJLE9BQU87QUFFVixXQUFLLFVBQVUsS0FBSztBQUNwQixXQUFLLHNCQUFzQjtBQUFBLElBQzVCLE9BQU87QUFDTixZQUFNLDZCQUE2QixLQUFLLHNCQUFzQiw4QkFBOEIsS0FBSyxRQUFRO0FBRXpHLFVBQUksNEJBQTRCLE9BQU87QUFDdEMsYUFBSyx5QkFBeUIsMkJBQTJCLEtBQUs7QUFBQSxNQUMvRDtBQUNBLFVBQUksS0FBSyxTQUFTLFNBQVM7QUFDMUIsYUFBSyxTQUFTLFFBQ1osT0FBTyxhQUFhLEVBQ3BCLFFBQVEsY0FBWTtBQUNwQixvQ0FBMEIsVUFBVSxNQUFNLEtBQUssRUFDN0MsUUFBUSxPQUFLLEtBQUssSUFBSSxDQUFDLENBQUM7QUFBQSxRQUMzQixDQUFDO0FBQUEsTUFDSDtBQUVBLFVBQUksOEJBQThCLEtBQUssUUFBUSxLQUFLLDRCQUE0QixLQUFLLFFBQVEsR0FBRztBQUMvRixhQUFLLFNBQVMsYUFBYSxRQUFRLFVBQVEsS0FBSyxhQUFhLElBQUksQ0FBQztBQUNsRSxhQUFLLGdEQUFnRCxLQUFLLFlBQVksQ0FBQztBQUN2RSxhQUFLLFVBQVUsS0FBSyxFQUFFLGtCQUFrQixLQUFLLENBQUM7QUFBQSxNQUMvQztBQUNBLFdBQUssV0FBVyxLQUFLLFNBQVMsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBYSxjQUF1QjtBQUNuQyxXQUFPLE1BQU0sZUFBZSxLQUFLLGFBQWEsT0FBTztBQUFBLEVBQ3REO0FBQUEsRUFFUyxpQkFBaUIsT0FBc0M7QUFDL0QsUUFBSSxPQUFPO0FBQ1YsVUFBSSxDQUFDLEtBQUssZ0JBQWdCLEtBQUssS0FBSyxtQkFBbUIsS0FBSyxHQUFHO0FBQzlELGFBQUssaUJBQWlCO0FBQ3RCO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxNQUFNLEdBQUcsQ0FBQyxHQUFHO0FBQ3ZDO0FBQUEsTUFDRDtBQUNBLFVBQUksS0FBSyxnQkFBZ0IsS0FBSyxHQUFHO0FBQ2hDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLDJCQUEyQjtBQUNoQyxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBRUQ7QUF6VWEsOEJBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkJVO0FBNFVOLFNBQVMsbUNBQW1DLG1CQUF1QyxNQUFvQztBQUM3SCxRQUFNLGtCQUFxQyxDQUFDO0FBQzVDLG9CQUFrQixRQUFRLENBQUMsb0JBQW9CO0FBQzlDLFVBQU0sZUFBZSxnQkFBZ0IsWUFBWSxNQUFNLElBQUk7QUFDM0Qsb0JBQWdCLGVBQWUsSUFBSSxDQUFDLGtCQUFrQjtBQUNyRCxZQUFNLGVBQTZCLGNBQWM7QUFDakQsWUFBTSxRQUFRLElBQUksZ0JBQWdCLE1BQU0sY0FBYyxjQUFjLGNBQWMsUUFBUSxnQkFBZ0IsWUFBWTtBQUN0SCxzQkFBZ0IsS0FBSyxLQUFLO0FBQUEsSUFDM0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNELFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
