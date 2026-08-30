import { createFastDomNode } from "../../../base/browser/fastDomNode.js";
import { createTrustedTypesPolicy } from "../../../base/browser/trustedTypes.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { StringBuilder } from "../../common/core/stringBuilder.js";
class RenderedLinesCollection {
  constructor(_lineFactory) {
    this._lineFactory = _lineFactory;
    this._set(1, []);
  }
  flush() {
    this._set(1, []);
  }
  _set(rendLineNumberStart, lines) {
    this._lines = lines;
    this._rendLineNumberStart = rendLineNumberStart;
  }
  _get() {
    return {
      rendLineNumberStart: this._rendLineNumberStart,
      lines: this._lines
    };
  }
  /**
   * @returns Inclusive line number that is inside this collection
   */
  getStartLineNumber() {
    return this._rendLineNumberStart;
  }
  /**
   * @returns Inclusive line number that is inside this collection
   */
  getEndLineNumber() {
    return this._rendLineNumberStart + this._lines.length - 1;
  }
  getCount() {
    return this._lines.length;
  }
  getLine(lineNumber) {
    const lineIndex = lineNumber - this._rendLineNumberStart;
    if (lineIndex < 0 || lineIndex >= this._lines.length) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._lines[lineIndex];
  }
  /**
   * @returns Lines that were removed from this collection
   */
  onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
    if (this.getCount() === 0) {
      return null;
    }
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    if (deleteToLineNumber < startLineNumber) {
      const deleteCnt = deleteToLineNumber - deleteFromLineNumber + 1;
      this._rendLineNumberStart -= deleteCnt;
      return null;
    }
    if (deleteFromLineNumber > endLineNumber) {
      return null;
    }
    let deleteStartIndex = 0;
    let deleteCount = 0;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineIndex = lineNumber - this._rendLineNumberStart;
      if (deleteFromLineNumber <= lineNumber && lineNumber <= deleteToLineNumber) {
        if (deleteCount === 0) {
          deleteStartIndex = lineIndex;
          deleteCount = 1;
        } else {
          deleteCount++;
        }
      }
    }
    if (deleteFromLineNumber < startLineNumber) {
      let deleteAboveCount = 0;
      if (deleteToLineNumber < startLineNumber) {
        deleteAboveCount = deleteToLineNumber - deleteFromLineNumber + 1;
      } else {
        deleteAboveCount = startLineNumber - deleteFromLineNumber;
      }
      this._rendLineNumberStart -= deleteAboveCount;
    }
    const deleted = this._lines.splice(deleteStartIndex, deleteCount);
    return deleted;
  }
  onLinesChanged(changeFromLineNumber, changeCount) {
    const changeToLineNumber = changeFromLineNumber + changeCount - 1;
    if (this.getCount() === 0) {
      return false;
    }
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    let someoneNotified = false;
    for (let changedLineNumber = changeFromLineNumber; changedLineNumber <= changeToLineNumber; changedLineNumber++) {
      if (changedLineNumber >= startLineNumber && changedLineNumber <= endLineNumber) {
        this._lines[changedLineNumber - this._rendLineNumberStart].onContentChanged();
        someoneNotified = true;
      }
    }
    return someoneNotified;
  }
  onLinesInserted(insertFromLineNumber, insertToLineNumber) {
    if (this.getCount() === 0) {
      return null;
    }
    const insertCnt = insertToLineNumber - insertFromLineNumber + 1;
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    if (insertFromLineNumber <= startLineNumber) {
      this._rendLineNumberStart += insertCnt;
      return null;
    }
    if (insertFromLineNumber > endLineNumber) {
      return null;
    }
    if (insertCnt + insertFromLineNumber > endLineNumber) {
      const deleted = this._lines.splice(insertFromLineNumber - this._rendLineNumberStart, endLineNumber - insertFromLineNumber + 1);
      return deleted;
    }
    const newLines = [];
    for (let i = 0; i < insertCnt; i++) {
      newLines[i] = this._lineFactory.createLine();
    }
    const insertIndex = insertFromLineNumber - this._rendLineNumberStart;
    const beforeLines = this._lines.slice(0, insertIndex);
    const afterLines = this._lines.slice(insertIndex, this._lines.length - insertCnt);
    const deletedLines = this._lines.slice(this._lines.length - insertCnt, this._lines.length);
    this._lines = beforeLines.concat(newLines).concat(afterLines);
    return deletedLines;
  }
  onTokensChanged(ranges) {
    if (this.getCount() === 0) {
      return false;
    }
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    let notifiedSomeone = false;
    for (let i = 0, len = ranges.length; i < len; i++) {
      const rng = ranges[i];
      if (rng.toLineNumber < startLineNumber || rng.fromLineNumber > endLineNumber) {
        continue;
      }
      const from = Math.max(startLineNumber, rng.fromLineNumber);
      const to = Math.min(endLineNumber, rng.toLineNumber);
      for (let lineNumber = from; lineNumber <= to; lineNumber++) {
        const lineIndex = lineNumber - this._rendLineNumberStart;
        this._lines[lineIndex].onTokensChanged();
        notifiedSomeone = true;
      }
    }
    return notifiedSomeone;
  }
}
class VisibleLinesCollection {
  constructor(_viewContext, _lineFactory) {
    this._viewContext = _viewContext;
    this._lineFactory = _lineFactory;
    this.domNode = this._createDomNode();
    this._linesCollection = new RenderedLinesCollection(this._lineFactory);
  }
  _createDomNode() {
    const domNode = createFastDomNode(document.createElement("div"));
    domNode.setClassName("view-layer");
    domNode.setPosition("absolute");
    domNode.domNode.setAttribute("role", "presentation");
    domNode.domNode.setAttribute("aria-hidden", "true");
    return domNode;
  }
  // ---- begin view event handlers
  onConfigurationChanged(e) {
    if (e.hasChanged(EditorOption.layoutInfo)) {
      return true;
    }
    return false;
  }
  onFlushed(e, flushDom) {
    if (flushDom) {
      const start = this._linesCollection.getStartLineNumber();
      const end = this._linesCollection.getEndLineNumber();
      for (let i = start; i <= end; i++) {
        this._linesCollection.getLine(i).getDomNode()?.remove();
      }
    }
    this._linesCollection.flush();
    return true;
  }
  onLinesChanged(e) {
    return this._linesCollection.onLinesChanged(e.fromLineNumber, e.count);
  }
  onLinesDeleted(e) {
    const deleted = this._linesCollection.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
    if (deleted) {
      for (let i = 0, len = deleted.length; i < len; i++) {
        const lineDomNode = deleted[i].getDomNode();
        lineDomNode?.remove();
      }
    }
    return true;
  }
  onLinesInserted(e) {
    const deleted = this._linesCollection.onLinesInserted(e.fromLineNumber, e.toLineNumber);
    if (deleted) {
      for (let i = 0, len = deleted.length; i < len; i++) {
        const lineDomNode = deleted[i].getDomNode();
        lineDomNode?.remove();
      }
    }
    return true;
  }
  onScrollChanged(e) {
    return e.scrollTopChanged;
  }
  onTokensChanged(e) {
    return this._linesCollection.onTokensChanged(e.ranges);
  }
  onZonesChanged(e) {
    return true;
  }
  // ---- end view event handlers
  getStartLineNumber() {
    return this._linesCollection.getStartLineNumber();
  }
  getEndLineNumber() {
    return this._linesCollection.getEndLineNumber();
  }
  getVisibleLine(lineNumber) {
    return this._linesCollection.getLine(lineNumber);
  }
  renderLines(viewportData) {
    const inp = this._linesCollection._get();
    const renderer = new ViewLayerRenderer(this.domNode.domNode, this._lineFactory, viewportData, this._viewContext);
    const ctx = {
      rendLineNumberStart: inp.rendLineNumberStart,
      lines: inp.lines,
      linesLength: inp.lines.length
    };
    const resCtx = renderer.render(ctx, viewportData.startLineNumber, viewportData.endLineNumber, viewportData.relativeVerticalOffset);
    this._linesCollection._set(resCtx.rendLineNumberStart, resCtx.lines);
  }
}
const _ViewLayerRenderer = class _ViewLayerRenderer {
  constructor(_domNode, _lineFactory, _viewportData, _viewContext) {
    this._domNode = _domNode;
    this._lineFactory = _lineFactory;
    this._viewportData = _viewportData;
    this._viewContext = _viewContext;
  }
  render(inContext, startLineNumber, stopLineNumber, deltaTop) {
    const ctx = {
      rendLineNumberStart: inContext.rendLineNumberStart,
      lines: inContext.lines.slice(0),
      linesLength: inContext.linesLength
    };
    if (ctx.rendLineNumberStart + ctx.linesLength - 1 < startLineNumber || stopLineNumber < ctx.rendLineNumberStart) {
      ctx.rendLineNumberStart = startLineNumber;
      ctx.linesLength = stopLineNumber - startLineNumber + 1;
      ctx.lines = [];
      for (let x = startLineNumber; x <= stopLineNumber; x++) {
        ctx.lines[x - startLineNumber] = this._lineFactory.createLine();
      }
      this._finishRendering(ctx, true, deltaTop);
      return ctx;
    }
    this._renderUntouchedLines(
      ctx,
      Math.max(startLineNumber - ctx.rendLineNumberStart, 0),
      Math.min(stopLineNumber - ctx.rendLineNumberStart, ctx.linesLength - 1),
      deltaTop,
      startLineNumber
    );
    if (ctx.rendLineNumberStart > startLineNumber) {
      const fromLineNumber = startLineNumber;
      const toLineNumber = Math.min(stopLineNumber, ctx.rendLineNumberStart - 1);
      if (fromLineNumber <= toLineNumber) {
        this._insertLinesBefore(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
        ctx.linesLength += toLineNumber - fromLineNumber + 1;
      }
    } else if (ctx.rendLineNumberStart < startLineNumber) {
      const removeCnt = Math.min(ctx.linesLength, startLineNumber - ctx.rendLineNumberStart);
      if (removeCnt > 0) {
        this._removeLinesBefore(ctx, removeCnt);
        ctx.linesLength -= removeCnt;
      }
    }
    ctx.rendLineNumberStart = startLineNumber;
    if (ctx.rendLineNumberStart + ctx.linesLength - 1 < stopLineNumber) {
      const fromLineNumber = ctx.rendLineNumberStart + ctx.linesLength;
      const toLineNumber = stopLineNumber;
      if (fromLineNumber <= toLineNumber) {
        this._insertLinesAfter(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
        ctx.linesLength += toLineNumber - fromLineNumber + 1;
      }
    } else if (ctx.rendLineNumberStart + ctx.linesLength - 1 > stopLineNumber) {
      const fromLineNumber = Math.max(0, stopLineNumber - ctx.rendLineNumberStart + 1);
      const toLineNumber = ctx.linesLength - 1;
      const removeCnt = toLineNumber - fromLineNumber + 1;
      if (removeCnt > 0) {
        this._removeLinesAfter(ctx, removeCnt);
        ctx.linesLength -= removeCnt;
      }
    }
    this._finishRendering(ctx, false, deltaTop);
    return ctx;
  }
  _renderUntouchedLines(ctx, startIndex, endIndex, deltaTop, deltaLN) {
    const rendLineNumberStart = ctx.rendLineNumberStart;
    const lines = ctx.lines;
    for (let i = startIndex; i <= endIndex; i++) {
      const lineNumber = rendLineNumberStart + i;
      lines[i].layoutLine(lineNumber, deltaTop[lineNumber - deltaLN], this._lineHeightForLineNumber(lineNumber));
    }
  }
  _insertLinesBefore(ctx, fromLineNumber, toLineNumber, deltaTop, deltaLN) {
    const newLines = [];
    let newLinesLen = 0;
    for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
      newLines[newLinesLen++] = this._lineFactory.createLine();
    }
    ctx.lines = newLines.concat(ctx.lines);
  }
  _removeLinesBefore(ctx, removeCount) {
    for (let i = 0; i < removeCount; i++) {
      const lineDomNode = ctx.lines[i].getDomNode();
      lineDomNode?.remove();
    }
    ctx.lines.splice(0, removeCount);
  }
  _insertLinesAfter(ctx, fromLineNumber, toLineNumber, deltaTop, deltaLN) {
    const newLines = [];
    let newLinesLen = 0;
    for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
      newLines[newLinesLen++] = this._lineFactory.createLine();
    }
    ctx.lines = ctx.lines.concat(newLines);
  }
  _removeLinesAfter(ctx, removeCount) {
    const removeIndex = ctx.linesLength - removeCount;
    for (let i = 0; i < removeCount; i++) {
      const lineDomNode = ctx.lines[removeIndex + i].getDomNode();
      lineDomNode?.remove();
    }
    ctx.lines.splice(removeIndex, removeCount);
  }
  _finishRenderingNewLines(ctx, domNodeIsEmpty, newLinesHTML, wasNew) {
    if (_ViewLayerRenderer._ttPolicy) {
      newLinesHTML = _ViewLayerRenderer._ttPolicy.createHTML(newLinesHTML);
    }
    const lastChild = this._domNode.lastChild;
    if (domNodeIsEmpty || !lastChild) {
      this._domNode.innerHTML = newLinesHTML;
    } else {
      lastChild.insertAdjacentHTML("afterend", newLinesHTML);
    }
    let currChild = this._domNode.lastChild;
    for (let i = ctx.linesLength - 1; i >= 0; i--) {
      const line = ctx.lines[i];
      if (wasNew[i]) {
        line.setDomNode(currChild);
        currChild = currChild.previousSibling;
      }
    }
  }
  _finishRenderingInvalidLines(ctx, invalidLinesHTML, wasInvalid) {
    const hugeDomNode = document.createElement("div");
    if (_ViewLayerRenderer._ttPolicy) {
      invalidLinesHTML = _ViewLayerRenderer._ttPolicy.createHTML(invalidLinesHTML);
    }
    hugeDomNode.innerHTML = invalidLinesHTML;
    for (let i = 0; i < ctx.linesLength; i++) {
      const line = ctx.lines[i];
      if (wasInvalid[i]) {
        const source = hugeDomNode.firstChild;
        const lineDomNode = line.getDomNode();
        lineDomNode.replaceWith(source);
        line.setDomNode(source);
      }
    }
  }
  _finishRendering(ctx, domNodeIsEmpty, deltaTop) {
    const sb = _ViewLayerRenderer._sb;
    const linesLength = ctx.linesLength;
    const lines = ctx.lines;
    const rendLineNumberStart = ctx.rendLineNumberStart;
    const wasNew = [];
    {
      sb.reset();
      let hadNewLine = false;
      for (let i = 0; i < linesLength; i++) {
        const line = lines[i];
        wasNew[i] = false;
        const lineDomNode = line.getDomNode();
        if (lineDomNode) {
          continue;
        }
        const renderedLineNumber = i + rendLineNumberStart;
        const renderResult = line.renderLine(renderedLineNumber, deltaTop[i], this._lineHeightForLineNumber(renderedLineNumber), this._viewportData, sb);
        if (!renderResult) {
          continue;
        }
        wasNew[i] = true;
        hadNewLine = true;
      }
      if (hadNewLine) {
        this._finishRenderingNewLines(ctx, domNodeIsEmpty, sb.build(), wasNew);
      }
    }
    {
      sb.reset();
      let hadInvalidLine = false;
      const wasInvalid = [];
      for (let i = 0; i < linesLength; i++) {
        const line = lines[i];
        wasInvalid[i] = false;
        if (wasNew[i]) {
          continue;
        }
        const renderedLineNumber = i + rendLineNumberStart;
        const renderResult = line.renderLine(renderedLineNumber, deltaTop[i], this._lineHeightForLineNumber(renderedLineNumber), this._viewportData, sb);
        if (!renderResult) {
          continue;
        }
        wasInvalid[i] = true;
        hadInvalidLine = true;
      }
      if (hadInvalidLine) {
        this._finishRenderingInvalidLines(ctx, sb.build(), wasInvalid);
      }
    }
  }
  _lineHeightForLineNumber(lineNumber) {
    return this._viewContext.viewLayout.getLineHeightForLineNumber(lineNumber);
  }
};
_ViewLayerRenderer._ttPolicy = createTrustedTypesPolicy("editorViewLayer", { createHTML: (value) => value });
_ViewLayerRenderer._sb = new StringBuilder(1e5);
let ViewLayerRenderer = _ViewLayerRenderer;
export {
  RenderedLinesCollection,
  VisibleLinesCollection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdcXHZpZXdMYXllci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEZhc3REb21Ob2RlLCBjcmVhdGVGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUcnVzdGVkVHlwZXNQb2xpY3kgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdHJ1c3RlZFR5cGVzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgU3RyaW5nQnVpbGRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3N0cmluZ0J1aWxkZXIuanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuLi8uLi9jb21tb24vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBWaWV3cG9ydERhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZXNWaWV3cG9ydERhdGEuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgdmlzaWJsZSBsaW5lXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVZpc2libGVMaW5lIGV4dGVuZHMgSUxpbmUge1xuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHwgbnVsbDtcblx0c2V0RG9tTm9kZShkb21Ob2RlOiBIVE1MRWxlbWVudCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybiBudWxsIGlmIHRoZSBIVE1MIHNob3VsZCBub3QgYmUgdG91Y2hlZC5cblx0ICogUmV0dXJuIHRoZSBuZXcgSFRNTCBvdGhlcndpc2UuXG5cdCAqL1xuXHRyZW5kZXJMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgZGVsdGFUb3A6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyLCB2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSwgc2I6IFN0cmluZ0J1aWxkZXIpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIGxpbmUuXG5cdCAqL1xuXHRsYXlvdXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgZGVsdGFUb3A6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGluZSB7XG5cdG9uQ29udGVudENoYW5nZWQoKTogdm9pZDtcblx0b25Ub2tlbnNDaGFuZ2VkKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmVGYWN0b3J5PFQgZXh0ZW5kcyBJTGluZT4ge1xuXHRjcmVhdGVMaW5lKCk6IFQ7XG59XG5cbmV4cG9ydCBjbGFzcyBSZW5kZXJlZExpbmVzQ29sbGVjdGlvbjxUIGV4dGVuZHMgSUxpbmU+IHtcblx0cHJpdmF0ZSBfbGluZXMhOiBUW107XG5cdHByaXZhdGUgX3JlbmRMaW5lTnVtYmVyU3RhcnQhOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGluZUZhY3Rvcnk6IElMaW5lRmFjdG9yeTxUPixcblx0KSB7XG5cdFx0dGhpcy5fc2V0KDEsIFtdKTtcblx0fVxuXG5cdHB1YmxpYyBmbHVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXQoMSwgW10pO1xuXHR9XG5cblx0X3NldChyZW5kTGluZU51bWJlclN0YXJ0OiBudW1iZXIsIGxpbmVzOiBUW10pOiB2b2lkIHtcblx0XHR0aGlzLl9saW5lcyA9IGxpbmVzO1xuXHRcdHRoaXMuX3JlbmRMaW5lTnVtYmVyU3RhcnQgPSByZW5kTGluZU51bWJlclN0YXJ0O1xuXHR9XG5cblx0X2dldCgpOiB7IHJlbmRMaW5lTnVtYmVyU3RhcnQ6IG51bWJlcjsgbGluZXM6IFRbXSB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVuZExpbmVOdW1iZXJTdGFydDogdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCxcblx0XHRcdGxpbmVzOiB0aGlzLl9saW5lc1xuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgSW5jbHVzaXZlIGxpbmUgbnVtYmVyIHRoYXQgaXMgaW5zaWRlIHRoaXMgY29sbGVjdGlvblxuXHQgKi9cblx0cHVibGljIGdldFN0YXJ0TGluZU51bWJlcigpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIEluY2x1c2l2ZSBsaW5lIG51bWJlciB0aGF0IGlzIGluc2lkZSB0aGlzIGNvbGxlY3Rpb25cblx0ICovXG5cdHB1YmxpYyBnZXRFbmRMaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRMaW5lTnVtYmVyU3RhcnQgKyB0aGlzLl9saW5lcy5sZW5ndGggLSAxO1xuXHR9XG5cblx0cHVibGljIGdldENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IFQge1xuXHRcdGNvbnN0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0O1xuXHRcdGlmIChsaW5lSW5kZXggPCAwIHx8IGxpbmVJbmRleCA+PSB0aGlzLl9saW5lcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIGxpbmVOdW1iZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzW2xpbmVJbmRleF07XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgTGluZXMgdGhhdCB3ZXJlIHJlbW92ZWQgZnJvbSB0aGlzIGNvbGxlY3Rpb25cblx0ICovXG5cdHB1YmxpYyBvbkxpbmVzRGVsZXRlZChkZWxldGVGcm9tTGluZU51bWJlcjogbnVtYmVyLCBkZWxldGVUb0xpbmVOdW1iZXI6IG51bWJlcik6IFRbXSB8IG51bGwge1xuXHRcdGlmICh0aGlzLmdldENvdW50KCkgPT09IDApIHtcblx0XHRcdC8vIG5vIGxpbmVzXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSB0aGlzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLmdldEVuZExpbmVOdW1iZXIoKTtcblxuXHRcdGlmIChkZWxldGVUb0xpbmVOdW1iZXIgPCBzdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIGRlbGV0aW5nIGFib3ZlIHRoZSB2aWV3cG9ydFxuXHRcdFx0Y29uc3QgZGVsZXRlQ250ID0gZGVsZXRlVG9MaW5lTnVtYmVyIC0gZGVsZXRlRnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0dGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCAtPSBkZWxldGVDbnQ7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoZGVsZXRlRnJvbUxpbmVOdW1iZXIgPiBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBkZWxldGVkIGJlbG93IHRoZSB2aWV3cG9ydFxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gUmVjb3JkIHdoYXQgbmVlZHMgdG8gYmUgZGVsZXRlZFxuXHRcdGxldCBkZWxldGVTdGFydEluZGV4ID0gMDtcblx0XHRsZXQgZGVsZXRlQ291bnQgPSAwO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydDtcblxuXHRcdFx0aWYgKGRlbGV0ZUZyb21MaW5lTnVtYmVyIDw9IGxpbmVOdW1iZXIgJiYgbGluZU51bWJlciA8PSBkZWxldGVUb0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gdGhpcyBpcyBhIGxpbmUgdG8gYmUgZGVsZXRlZFxuXHRcdFx0XHRpZiAoZGVsZXRlQ291bnQgPT09IDApIHtcblx0XHRcdFx0XHQvLyB0aGlzIGlzIHRoZSBmaXJzdCBsaW5lIHRvIGJlIGRlbGV0ZWRcblx0XHRcdFx0XHRkZWxldGVTdGFydEluZGV4ID0gbGluZUluZGV4O1xuXHRcdFx0XHRcdGRlbGV0ZUNvdW50ID0gMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWxldGVDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRqdXN0IHRoaXMuX3JlbmRMaW5lTnVtYmVyU3RhcnQgZm9yIGxpbmVzIGRlbGV0ZWQgYWJvdmVcblx0XHRpZiAoZGVsZXRlRnJvbUxpbmVOdW1iZXIgPCBzdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIFNvbWV0aGluZyB3YXMgZGVsZXRlZCBhYm92ZVxuXHRcdFx0bGV0IGRlbGV0ZUFib3ZlQ291bnQgPSAwO1xuXG5cdFx0XHRpZiAoZGVsZXRlVG9MaW5lTnVtYmVyIDwgc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIHRoZSBlbnRpcmUgZGVsZXRlZCBsaW5lcyBhcmUgYWJvdmVcblx0XHRcdFx0ZGVsZXRlQWJvdmVDb3VudCA9IGRlbGV0ZVRvTGluZU51bWJlciAtIGRlbGV0ZUZyb21MaW5lTnVtYmVyICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlbGV0ZUFib3ZlQ291bnQgPSBzdGFydExpbmVOdW1iZXIgLSBkZWxldGVGcm9tTGluZU51bWJlcjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCAtPSBkZWxldGVBYm92ZUNvdW50O1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGV0ZWQgPSB0aGlzLl9saW5lcy5zcGxpY2UoZGVsZXRlU3RhcnRJbmRleCwgZGVsZXRlQ291bnQpO1xuXHRcdHJldHVybiBkZWxldGVkO1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNDaGFuZ2VkKGNoYW5nZUZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGNoYW5nZUNvdW50OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VUb0xpbmVOdW1iZXIgPSBjaGFuZ2VGcm9tTGluZU51bWJlciArIGNoYW5nZUNvdW50IC0gMTtcblx0XHRpZiAodGhpcy5nZXRDb3VudCgpID09PSAwKSB7XG5cdFx0XHQvLyBubyBsaW5lc1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXG5cdFx0bGV0IHNvbWVvbmVOb3RpZmllZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChsZXQgY2hhbmdlZExpbmVOdW1iZXIgPSBjaGFuZ2VGcm9tTGluZU51bWJlcjsgY2hhbmdlZExpbmVOdW1iZXIgPD0gY2hhbmdlVG9MaW5lTnVtYmVyOyBjaGFuZ2VkTGluZU51bWJlcisrKSB7XG5cdFx0XHRpZiAoY2hhbmdlZExpbmVOdW1iZXIgPj0gc3RhcnRMaW5lTnVtYmVyICYmIGNoYW5nZWRMaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gTm90aWZ5IHRoZSBsaW5lXG5cdFx0XHRcdHRoaXMuX2xpbmVzW2NoYW5nZWRMaW5lTnVtYmVyIC0gdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydF0ub25Db250ZW50Q2hhbmdlZCgpO1xuXHRcdFx0XHRzb21lb25lTm90aWZpZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzb21lb25lTm90aWZpZWQ7XG5cdH1cblxuXHRwdWJsaWMgb25MaW5lc0luc2VydGVkKGluc2VydEZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGluc2VydFRvTGluZU51bWJlcjogbnVtYmVyKTogVFtdIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuZ2V0Q291bnQoKSA9PT0gMCkge1xuXHRcdFx0Ly8gbm8gbGluZXNcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc2VydENudCA9IGluc2VydFRvTGluZU51bWJlciAtIGluc2VydEZyb21MaW5lTnVtYmVyICsgMTtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSB0aGlzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLmdldEVuZExpbmVOdW1iZXIoKTtcblxuXHRcdGlmIChpbnNlcnRGcm9tTGluZU51bWJlciA8PSBzdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIGluc2VydGluZyBhYm92ZSB0aGUgdmlld3BvcnRcblx0XHRcdHRoaXMuX3JlbmRMaW5lTnVtYmVyU3RhcnQgKz0gaW5zZXJ0Q250O1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKGluc2VydEZyb21MaW5lTnVtYmVyID4gZW5kTGluZU51bWJlcikge1xuXHRcdFx0Ly8gaW5zZXJ0aW5nIGJlbG93IHRoZSB2aWV3cG9ydFxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKGluc2VydENudCArIGluc2VydEZyb21MaW5lTnVtYmVyID4gZW5kTGluZU51bWJlcikge1xuXHRcdFx0Ly8gaW5zZXJ0IGluc2lkZSB0aGUgdmlld3BvcnQgaW4gc3VjaCBhIHdheSB0aGF0IGFsbCByZW1haW5pbmcgbGluZXMgYXJlIHB1c2hlZCBvdXRzaWRlXG5cdFx0XHRjb25zdCBkZWxldGVkID0gdGhpcy5fbGluZXMuc3BsaWNlKGluc2VydEZyb21MaW5lTnVtYmVyIC0gdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCwgZW5kTGluZU51bWJlciAtIGluc2VydEZyb21MaW5lTnVtYmVyICsgMSk7XG5cdFx0XHRyZXR1cm4gZGVsZXRlZDtcblx0XHR9XG5cblx0XHQvLyBpbnNlcnQgaW5zaWRlIHRoZSB2aWV3cG9ydCwgcHVzaCBvdXQgc29tZSBsaW5lcywgYnV0IG5vdCBhbGwgcmVtYWluaW5nIGxpbmVzXG5cdFx0Y29uc3QgbmV3TGluZXM6IFRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5zZXJ0Q250OyBpKyspIHtcblx0XHRcdG5ld0xpbmVzW2ldID0gdGhpcy5fbGluZUZhY3RvcnkuY3JlYXRlTGluZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpbnNlcnRJbmRleCA9IGluc2VydEZyb21MaW5lTnVtYmVyIC0gdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydDtcblx0XHRjb25zdCBiZWZvcmVMaW5lcyA9IHRoaXMuX2xpbmVzLnNsaWNlKDAsIGluc2VydEluZGV4KTtcblx0XHRjb25zdCBhZnRlckxpbmVzID0gdGhpcy5fbGluZXMuc2xpY2UoaW5zZXJ0SW5kZXgsIHRoaXMuX2xpbmVzLmxlbmd0aCAtIGluc2VydENudCk7XG5cdFx0Y29uc3QgZGVsZXRlZExpbmVzID0gdGhpcy5fbGluZXMuc2xpY2UodGhpcy5fbGluZXMubGVuZ3RoIC0gaW5zZXJ0Q250LCB0aGlzLl9saW5lcy5sZW5ndGgpO1xuXG5cdFx0dGhpcy5fbGluZXMgPSBiZWZvcmVMaW5lcy5jb25jYXQobmV3TGluZXMpLmNvbmNhdChhZnRlckxpbmVzKTtcblxuXHRcdHJldHVybiBkZWxldGVkTGluZXM7XG5cdH1cblxuXHRwdWJsaWMgb25Ub2tlbnNDaGFuZ2VkKHJhbmdlczogeyBmcm9tTGluZU51bWJlcjogbnVtYmVyOyB0b0xpbmVOdW1iZXI6IG51bWJlciB9W10pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5nZXRDb3VudCgpID09PSAwKSB7XG5cdFx0XHQvLyBubyBsaW5lc1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXG5cdFx0bGV0IG5vdGlmaWVkU29tZW9uZSA9IGZhbHNlO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHJuZyA9IHJhbmdlc1tpXTtcblxuXHRcdFx0aWYgKHJuZy50b0xpbmVOdW1iZXIgPCBzdGFydExpbmVOdW1iZXIgfHwgcm5nLmZyb21MaW5lTnVtYmVyID4gZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHQvLyByYW5nZSBvdXRzaWRlIHZpZXdwb3J0XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmcm9tID0gTWF0aC5tYXgoc3RhcnRMaW5lTnVtYmVyLCBybmcuZnJvbUxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgdG8gPSBNYXRoLm1pbihlbmRMaW5lTnVtYmVyLCBybmcudG9MaW5lTnVtYmVyKTtcblxuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IGZyb207IGxpbmVOdW1iZXIgPD0gdG87IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydDtcblx0XHRcdFx0dGhpcy5fbGluZXNbbGluZUluZGV4XS5vblRva2Vuc0NoYW5nZWQoKTtcblx0XHRcdFx0bm90aWZpZWRTb21lb25lID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbm90aWZpZWRTb21lb25lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWaXNpYmxlTGluZXNDb2xsZWN0aW9uPFQgZXh0ZW5kcyBJVmlzaWJsZUxpbmU+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lc0NvbGxlY3Rpb246IFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uPFQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdDb250ZXh0OiBWaWV3Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9saW5lRmFjdG9yeTogSUxpbmVGYWN0b3J5PFQ+LFxuXHQpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSB0aGlzLl9jcmVhdGVEb21Ob2RlKCk7XG5cdFx0dGhpcy5fbGluZXNDb2xsZWN0aW9uID0gbmV3IFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uPFQ+KHRoaXMuX2xpbmVGYWN0b3J5KTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZURvbU5vZGUoKTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHtcblx0XHRjb25zdCBkb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdGRvbU5vZGUuc2V0Q2xhc3NOYW1lKCd2aWV3LWxheWVyJyk7XG5cdFx0ZG9tTm9kZS5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblx0XHRkb21Ob2RlLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3ByZXNlbnRhdGlvbicpO1xuXHRcdGRvbU5vZGUuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRyZXR1cm4gZG9tTm9kZTtcblx0fVxuXG5cdC8vIC0tLS0gYmVnaW4gdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBvbkZsdXNoZWQoZTogdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50LCBmbHVzaERvbT86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHQvLyBObyBuZWVkIHRvIGNsZWFyIHRoZSBkb20gbm9kZSBiZWNhdXNlIGEgZnVsbCAuaW5uZXJIVE1MIHdpbGwgb2NjdXIgaW5cblx0XHQvLyBWaWV3TGF5ZXJSZW5kZXJlci5fcmVuZGVyLCBob3dldmVyIHRoZSBmYWxsYmFjayBtZWNoYW5pc20gaW4gdGhlXG5cdFx0Ly8gR1BVIHJlbmRlcmVyIG1heSBjYXVzZSB0aGlzIHRvIGJlIG5lY2Vzc2FyeSBhcyB0aGUgLmlubmVySFRNTCBjYWxsXG5cdFx0Ly8gbWF5IG5vdCBoYXBwZW4gZGVwZW5kaW5nIG9uIHRoZSBuZXcgc3RhdGUsIGxlYXZpbmcgc3RhbGUgRE9NIG5vZGVzXG5cdFx0Ly8gYXJvdW5kLlxuXHRcdGlmIChmbHVzaERvbSkge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLl9saW5lc0NvbGxlY3Rpb24uZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0XHRjb25zdCBlbmQgPSB0aGlzLl9saW5lc0NvbGxlY3Rpb24uZ2V0RW5kTGluZU51bWJlcigpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5nZXRMaW5lKGkpLmdldERvbU5vZGUoKT8ucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5mbHVzaCgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5vbkxpbmVzQ2hhbmdlZChlLmZyb21MaW5lTnVtYmVyLCBlLmNvdW50KTtcblx0fVxuXG5cdHB1YmxpYyBvbkxpbmVzRGVsZXRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSB0aGlzLl9saW5lc0NvbGxlY3Rpb24ub25MaW5lc0RlbGV0ZWQoZS5mcm9tTGluZU51bWJlciwgZS50b0xpbmVOdW1iZXIpO1xuXHRcdGlmIChkZWxldGVkKSB7XG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBkZWxldGVkLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVEb21Ob2RlID0gZGVsZXRlZFtpXS5nZXREb21Ob2RlKCk7XG5cdFx0XHRcdGxpbmVEb21Ob2RlPy5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvbkxpbmVzSW5zZXJ0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGVsZXRlZCA9IHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5vbkxpbmVzSW5zZXJ0ZWQoZS5mcm9tTGluZU51bWJlciwgZS50b0xpbmVOdW1iZXIpO1xuXHRcdGlmIChkZWxldGVkKSB7XG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBkZWxldGVkLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVEb21Ob2RlID0gZGVsZXRlZFtpXS5nZXREb21Ob2RlKCk7XG5cdFx0XHRcdGxpbmVEb21Ob2RlPy5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvblNjcm9sbENoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGUuc2Nyb2xsVG9wQ2hhbmdlZDtcblx0fVxuXG5cdHB1YmxpYyBvblRva2Vuc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3VG9rZW5zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5vblRva2Vuc0NoYW5nZWQoZS5yYW5nZXMpO1xuXHR9XG5cblx0cHVibGljIG9uWm9uZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLS0tIGVuZCB2aWV3IGV2ZW50IGhhbmRsZXJzXG5cblx0cHVibGljIGdldFN0YXJ0TGluZU51bWJlcigpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lc0NvbGxlY3Rpb24uZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5kTGluZU51bWJlcigpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lc0NvbGxlY3Rpb24uZ2V0RW5kTGluZU51bWJlcigpO1xuXHR9XG5cblx0cHVibGljIGdldFZpc2libGVMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IFQge1xuXHRcdHJldHVybiB0aGlzLl9saW5lc0NvbGxlY3Rpb24uZ2V0TGluZShsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXJMaW5lcyh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgaW5wID0gdGhpcy5fbGluZXNDb2xsZWN0aW9uLl9nZXQoKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVyID0gbmV3IFZpZXdMYXllclJlbmRlcmVyPFQ+KHRoaXMuZG9tTm9kZS5kb21Ob2RlLCB0aGlzLl9saW5lRmFjdG9yeSwgdmlld3BvcnREYXRhLCB0aGlzLl92aWV3Q29udGV4dCk7XG5cblx0XHRjb25zdCBjdHg6IElSZW5kZXJlckNvbnRleHQ8VD4gPSB7XG5cdFx0XHRyZW5kTGluZU51bWJlclN0YXJ0OiBpbnAucmVuZExpbmVOdW1iZXJTdGFydCxcblx0XHRcdGxpbmVzOiBpbnAubGluZXMsXG5cdFx0XHRsaW5lc0xlbmd0aDogaW5wLmxpbmVzLmxlbmd0aFxuXHRcdH07XG5cblx0XHQvLyBEZWNpZGUgaWYgdGhpcyByZW5kZXIgd2lsbCBkbyBhIHNpbmdsZSB1cGRhdGUgKHNpbmdsZSBsYXJnZSAuaW5uZXJIVE1MKSBvciBtYW55IHVwZGF0ZXMgKGluc2VydGluZy9yZW1vdmluZyBkb20gbm9kZXMpXG5cdFx0Y29uc3QgcmVzQ3R4ID0gcmVuZGVyZXIucmVuZGVyKGN0eCwgdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlciwgdmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIsIHZpZXdwb3J0RGF0YS5yZWxhdGl2ZVZlcnRpY2FsT2Zmc2V0KTtcblxuXHRcdHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5fc2V0KHJlc0N0eC5yZW5kTGluZU51bWJlclN0YXJ0LCByZXNDdHgubGluZXMpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJUmVuZGVyZXJDb250ZXh0PFQgZXh0ZW5kcyBJVmlzaWJsZUxpbmU+IHtcblx0cmVuZExpbmVOdW1iZXJTdGFydDogbnVtYmVyO1xuXHRsaW5lczogVFtdO1xuXHRsaW5lc0xlbmd0aDogbnVtYmVyO1xufVxuXG5jbGFzcyBWaWV3TGF5ZXJSZW5kZXJlcjxUIGV4dGVuZHMgSVZpc2libGVMaW5lPiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3R0UG9saWN5ID0gY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5KCdlZGl0b3JWaWV3TGF5ZXInLCB7IGNyZWF0ZUhUTUw6IHZhbHVlID0+IHZhbHVlIH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVGYWN0b3J5OiBJTGluZUZhY3Rvcnk8VD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0NvbnRleHQ6IFZpZXdDb250ZXh0XG5cdCkge1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihpbkNvbnRleHQ6IElSZW5kZXJlckNvbnRleHQ8VD4sIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdG9wTGluZU51bWJlcjogbnVtYmVyLCBkZWx0YVRvcDogbnVtYmVyW10pOiBJUmVuZGVyZXJDb250ZXh0PFQ+IHtcblxuXHRcdGNvbnN0IGN0eDogSVJlbmRlcmVyQ29udGV4dDxUPiA9IHtcblx0XHRcdHJlbmRMaW5lTnVtYmVyU3RhcnQ6IGluQ29udGV4dC5yZW5kTGluZU51bWJlclN0YXJ0LFxuXHRcdFx0bGluZXM6IGluQ29udGV4dC5saW5lcy5zbGljZSgwKSxcblx0XHRcdGxpbmVzTGVuZ3RoOiBpbkNvbnRleHQubGluZXNMZW5ndGhcblx0XHR9O1xuXG5cdFx0aWYgKChjdHgucmVuZExpbmVOdW1iZXJTdGFydCArIGN0eC5saW5lc0xlbmd0aCAtIDEgPCBzdGFydExpbmVOdW1iZXIpIHx8IChzdG9wTGluZU51bWJlciA8IGN0eC5yZW5kTGluZU51bWJlclN0YXJ0KSkge1xuXHRcdFx0Ly8gVGhlcmUgaXMgbm8gb3ZlcmxhcCB3aGF0c29ldmVyXG5cdFx0XHRjdHgucmVuZExpbmVOdW1iZXJTdGFydCA9IHN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGN0eC5saW5lc0xlbmd0aCA9IHN0b3BMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMTtcblx0XHRcdGN0eC5saW5lcyA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgeCA9IHN0YXJ0TGluZU51bWJlcjsgeCA8PSBzdG9wTGluZU51bWJlcjsgeCsrKSB7XG5cdFx0XHRcdGN0eC5saW5lc1t4IC0gc3RhcnRMaW5lTnVtYmVyXSA9IHRoaXMuX2xpbmVGYWN0b3J5LmNyZWF0ZUxpbmUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2ZpbmlzaFJlbmRlcmluZyhjdHgsIHRydWUsIGRlbHRhVG9wKTtcblx0XHRcdHJldHVybiBjdHg7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGxpbmVzIHdoaWNoIHdpbGwgcmVtYWluIHVudG91Y2hlZFxuXHRcdHRoaXMuX3JlbmRlclVudG91Y2hlZExpbmVzKFxuXHRcdFx0Y3R4LFxuXHRcdFx0TWF0aC5tYXgoc3RhcnRMaW5lTnVtYmVyIC0gY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQsIDApLFxuXHRcdFx0TWF0aC5taW4oc3RvcExpbmVOdW1iZXIgLSBjdHgucmVuZExpbmVOdW1iZXJTdGFydCwgY3R4LmxpbmVzTGVuZ3RoIC0gMSksXG5cdFx0XHRkZWx0YVRvcCxcblx0XHRcdHN0YXJ0TGluZU51bWJlclxuXHRcdCk7XG5cblx0XHRpZiAoY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQgPiBzdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIEluc2VydCBsaW5lcyBiZWZvcmVcblx0XHRcdGNvbnN0IGZyb21MaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgdG9MaW5lTnVtYmVyID0gTWF0aC5taW4oc3RvcExpbmVOdW1iZXIsIGN0eC5yZW5kTGluZU51bWJlclN0YXJ0IC0gMSk7XG5cdFx0XHRpZiAoZnJvbUxpbmVOdW1iZXIgPD0gdG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRoaXMuX2luc2VydExpbmVzQmVmb3JlKGN0eCwgZnJvbUxpbmVOdW1iZXIsIHRvTGluZU51bWJlciwgZGVsdGFUb3AsIHN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdGN0eC5saW5lc0xlbmd0aCArPSB0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDE7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjdHgucmVuZExpbmVOdW1iZXJTdGFydCA8IHN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gUmVtb3ZlIGxpbmVzIGJlZm9yZVxuXHRcdFx0Y29uc3QgcmVtb3ZlQ250ID0gTWF0aC5taW4oY3R4LmxpbmVzTGVuZ3RoLCBzdGFydExpbmVOdW1iZXIgLSBjdHgucmVuZExpbmVOdW1iZXJTdGFydCk7XG5cdFx0XHRpZiAocmVtb3ZlQ250ID4gMCkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVMaW5lc0JlZm9yZShjdHgsIHJlbW92ZUNudCk7XG5cdFx0XHRcdGN0eC5saW5lc0xlbmd0aCAtPSByZW1vdmVDbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQgPSBzdGFydExpbmVOdW1iZXI7XG5cblx0XHRpZiAoY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQgKyBjdHgubGluZXNMZW5ndGggLSAxIDwgc3RvcExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIEluc2VydCBsaW5lcyBhZnRlclxuXHRcdFx0Y29uc3QgZnJvbUxpbmVOdW1iZXIgPSBjdHgucmVuZExpbmVOdW1iZXJTdGFydCArIGN0eC5saW5lc0xlbmd0aDtcblx0XHRcdGNvbnN0IHRvTGluZU51bWJlciA9IHN0b3BMaW5lTnVtYmVyO1xuXG5cdFx0XHRpZiAoZnJvbUxpbmVOdW1iZXIgPD0gdG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRoaXMuX2luc2VydExpbmVzQWZ0ZXIoY3R4LCBmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyLCBkZWx0YVRvcCwgc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0Y3R4LmxpbmVzTGVuZ3RoICs9IHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyICsgMTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAoY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQgKyBjdHgubGluZXNMZW5ndGggLSAxID4gc3RvcExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIFJlbW92ZSBsaW5lcyBhZnRlclxuXHRcdFx0Y29uc3QgZnJvbUxpbmVOdW1iZXIgPSBNYXRoLm1heCgwLCBzdG9wTGluZU51bWJlciAtIGN0eC5yZW5kTGluZU51bWJlclN0YXJ0ICsgMSk7XG5cdFx0XHRjb25zdCB0b0xpbmVOdW1iZXIgPSBjdHgubGluZXNMZW5ndGggLSAxO1xuXHRcdFx0Y29uc3QgcmVtb3ZlQ250ID0gdG9MaW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIgKyAxO1xuXG5cdFx0XHRpZiAocmVtb3ZlQ250ID4gMCkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVMaW5lc0FmdGVyKGN0eCwgcmVtb3ZlQ250KTtcblx0XHRcdFx0Y3R4LmxpbmVzTGVuZ3RoIC09IHJlbW92ZUNudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9maW5pc2hSZW5kZXJpbmcoY3R4LCBmYWxzZSwgZGVsdGFUb3ApO1xuXG5cdFx0cmV0dXJuIGN0eDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclVudG91Y2hlZExpbmVzKGN0eDogSVJlbmRlcmVyQ29udGV4dDxUPiwgc3RhcnRJbmRleDogbnVtYmVyLCBlbmRJbmRleDogbnVtYmVyLCBkZWx0YVRvcDogbnVtYmVyW10sIGRlbHRhTE46IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRMaW5lTnVtYmVyU3RhcnQgPSBjdHgucmVuZExpbmVOdW1iZXJTdGFydDtcblx0XHRjb25zdCBsaW5lcyA9IGN0eC5saW5lcztcblxuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4OyBpIDw9IGVuZEluZGV4OyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSByZW5kTGluZU51bWJlclN0YXJ0ICsgaTtcblx0XHRcdGxpbmVzW2ldLmxheW91dExpbmUobGluZU51bWJlciwgZGVsdGFUb3BbbGluZU51bWJlciAtIGRlbHRhTE5dLCB0aGlzLl9saW5lSGVpZ2h0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW5zZXJ0TGluZXNCZWZvcmUoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCBmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlciwgZGVsdGFUb3A6IG51bWJlcltdLCBkZWx0YUxOOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdMaW5lczogVFtdID0gW107XG5cdFx0bGV0IG5ld0xpbmVzTGVuID0gMDtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdG9MaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdG5ld0xpbmVzW25ld0xpbmVzTGVuKytdID0gdGhpcy5fbGluZUZhY3RvcnkuY3JlYXRlTGluZSgpO1xuXHRcdH1cblx0XHRjdHgubGluZXMgPSBuZXdMaW5lcy5jb25jYXQoY3R4LmxpbmVzKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUxpbmVzQmVmb3JlKGN0eDogSVJlbmRlcmVyQ29udGV4dDxUPiwgcmVtb3ZlQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVtb3ZlQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZURvbU5vZGUgPSBjdHgubGluZXNbaV0uZ2V0RG9tTm9kZSgpO1xuXHRcdFx0bGluZURvbU5vZGU/LnJlbW92ZSgpO1xuXHRcdH1cblx0XHRjdHgubGluZXMuc3BsaWNlKDAsIHJlbW92ZUNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgX2luc2VydExpbmVzQWZ0ZXIoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCBmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlciwgZGVsdGFUb3A6IG51bWJlcltdLCBkZWx0YUxOOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdMaW5lczogVFtdID0gW107XG5cdFx0bGV0IG5ld0xpbmVzTGVuID0gMDtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdG9MaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdG5ld0xpbmVzW25ld0xpbmVzTGVuKytdID0gdGhpcy5fbGluZUZhY3RvcnkuY3JlYXRlTGluZSgpO1xuXHRcdH1cblx0XHRjdHgubGluZXMgPSBjdHgubGluZXMuY29uY2F0KG5ld0xpbmVzKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUxpbmVzQWZ0ZXIoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCByZW1vdmVDb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVtb3ZlSW5kZXggPSBjdHgubGluZXNMZW5ndGggLSByZW1vdmVDb3VudDtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVtb3ZlQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZURvbU5vZGUgPSBjdHgubGluZXNbcmVtb3ZlSW5kZXggKyBpXS5nZXREb21Ob2RlKCk7XG5cdFx0XHRsaW5lRG9tTm9kZT8ucmVtb3ZlKCk7XG5cdFx0fVxuXHRcdGN0eC5saW5lcy5zcGxpY2UocmVtb3ZlSW5kZXgsIHJlbW92ZUNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmlzaFJlbmRlcmluZ05ld0xpbmVzKGN0eDogSVJlbmRlcmVyQ29udGV4dDxUPiwgZG9tTm9kZUlzRW1wdHk6IGJvb2xlYW4sIG5ld0xpbmVzSFRNTDogc3RyaW5nIHwgVHJ1c3RlZEhUTUwsIHdhc05ldzogYm9vbGVhbltdKTogdm9pZCB7XG5cdFx0aWYgKFZpZXdMYXllclJlbmRlcmVyLl90dFBvbGljeSkge1xuXHRcdFx0bmV3TGluZXNIVE1MID0gVmlld0xheWVyUmVuZGVyZXIuX3R0UG9saWN5LmNyZWF0ZUhUTUwobmV3TGluZXNIVE1MIGFzIHN0cmluZyk7XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RDaGlsZCA9IDxIVE1MRWxlbWVudD50aGlzLl9kb21Ob2RlLmxhc3RDaGlsZDtcblx0XHRpZiAoZG9tTm9kZUlzRW1wdHkgfHwgIWxhc3RDaGlsZCkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5pbm5lckhUTUwgPSBuZXdMaW5lc0hUTUwgYXMgc3RyaW5nOyAvLyBleHBsYWlucyB0aGUgdWdseSBjYXN0cyAtPiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA2Mzk2I2lzc3VlY29tbWVudC02OTI2MjUzOTM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxhc3RDaGlsZC5pbnNlcnRBZGphY2VudEhUTUwoJ2FmdGVyZW5kJywgbmV3TGluZXNIVE1MIGFzIHN0cmluZyk7XG5cdFx0fVxuXG5cdFx0bGV0IGN1cnJDaGlsZCA9IDxIVE1MRWxlbWVudD50aGlzLl9kb21Ob2RlLmxhc3RDaGlsZDtcblx0XHRmb3IgKGxldCBpID0gY3R4LmxpbmVzTGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBjdHgubGluZXNbaV07XG5cdFx0XHRpZiAod2FzTmV3W2ldKSB7XG5cdFx0XHRcdGxpbmUuc2V0RG9tTm9kZShjdXJyQ2hpbGQpO1xuXHRcdFx0XHRjdXJyQ2hpbGQgPSA8SFRNTEVsZW1lbnQ+Y3VyckNoaWxkLnByZXZpb3VzU2libGluZztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maW5pc2hSZW5kZXJpbmdJbnZhbGlkTGluZXMoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCBpbnZhbGlkTGluZXNIVE1MOiBzdHJpbmcgfCBUcnVzdGVkSFRNTCwgd2FzSW52YWxpZDogYm9vbGVhbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgaHVnZURvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdGlmIChWaWV3TGF5ZXJSZW5kZXJlci5fdHRQb2xpY3kpIHtcblx0XHRcdGludmFsaWRMaW5lc0hUTUwgPSBWaWV3TGF5ZXJSZW5kZXJlci5fdHRQb2xpY3kuY3JlYXRlSFRNTChpbnZhbGlkTGluZXNIVE1MIGFzIHN0cmluZyk7XG5cdFx0fVxuXHRcdGh1Z2VEb21Ob2RlLmlubmVySFRNTCA9IGludmFsaWRMaW5lc0hUTUwgYXMgc3RyaW5nO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjdHgubGluZXNMZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IGN0eC5saW5lc1tpXTtcblx0XHRcdGlmICh3YXNJbnZhbGlkW2ldKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IDxIVE1MRWxlbWVudD5odWdlRG9tTm9kZS5maXJzdENoaWxkO1xuXHRcdFx0XHRjb25zdCBsaW5lRG9tTm9kZSA9IGxpbmUuZ2V0RG9tTm9kZSgpITtcblx0XHRcdFx0bGluZURvbU5vZGUucmVwbGFjZVdpdGgoc291cmNlKTtcblx0XHRcdFx0bGluZS5zZXREb21Ob2RlKHNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3NiID0gbmV3IFN0cmluZ0J1aWxkZXIoMTAwMDAwKTtcblxuXHRwcml2YXRlIF9maW5pc2hSZW5kZXJpbmcoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCBkb21Ob2RlSXNFbXB0eTogYm9vbGVhbiwgZGVsdGFUb3A6IG51bWJlcltdKTogdm9pZCB7XG5cblx0XHRjb25zdCBzYiA9IFZpZXdMYXllclJlbmRlcmVyLl9zYjtcblx0XHRjb25zdCBsaW5lc0xlbmd0aCA9IGN0eC5saW5lc0xlbmd0aDtcblx0XHRjb25zdCBsaW5lcyA9IGN0eC5saW5lcztcblx0XHRjb25zdCByZW5kTGluZU51bWJlclN0YXJ0ID0gY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQ7XG5cblx0XHRjb25zdCB3YXNOZXc6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdHtcblx0XHRcdHNiLnJlc2V0KCk7XG5cdFx0XHRsZXQgaGFkTmV3TGluZSA9IGZhbHNlO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzTGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXHRcdFx0XHR3YXNOZXdbaV0gPSBmYWxzZTtcblxuXHRcdFx0XHRjb25zdCBsaW5lRG9tTm9kZSA9IGxpbmUuZ2V0RG9tTm9kZSgpO1xuXHRcdFx0XHRpZiAobGluZURvbU5vZGUpIHtcblx0XHRcdFx0XHQvLyBsaW5lIGlzIG5vdCBuZXdcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkTGluZU51bWJlciA9IGkgKyByZW5kTGluZU51bWJlclN0YXJ0O1xuXHRcdFx0XHRjb25zdCByZW5kZXJSZXN1bHQgPSBsaW5lLnJlbmRlckxpbmUocmVuZGVyZWRMaW5lTnVtYmVyLCBkZWx0YVRvcFtpXSwgdGhpcy5fbGluZUhlaWdodEZvckxpbmVOdW1iZXIocmVuZGVyZWRMaW5lTnVtYmVyKSwgdGhpcy5fdmlld3BvcnREYXRhLCBzYik7XG5cdFx0XHRcdGlmICghcmVuZGVyUmVzdWx0KSB7XG5cdFx0XHRcdFx0Ly8gbGluZSBkb2VzIG5vdCBuZWVkIHJlbmRlcmluZ1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0d2FzTmV3W2ldID0gdHJ1ZTtcblx0XHRcdFx0aGFkTmV3TGluZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYWROZXdMaW5lKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaFJlbmRlcmluZ05ld0xpbmVzKGN0eCwgZG9tTm9kZUlzRW1wdHksIHNiLmJ1aWxkKCksIHdhc05ldyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0c2IucmVzZXQoKTtcblxuXHRcdFx0bGV0IGhhZEludmFsaWRMaW5lID0gZmFsc2U7XG5cdFx0XHRjb25zdCB3YXNJbnZhbGlkOiBib29sZWFuW10gPSBbXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lc0xlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcblx0XHRcdFx0d2FzSW52YWxpZFtpXSA9IGZhbHNlO1xuXG5cdFx0XHRcdGlmICh3YXNOZXdbaV0pIHtcblx0XHRcdFx0XHQvLyBsaW5lIHdhcyBuZXdcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkTGluZU51bWJlciA9IGkgKyByZW5kTGluZU51bWJlclN0YXJ0O1xuXHRcdFx0XHRjb25zdCByZW5kZXJSZXN1bHQgPSBsaW5lLnJlbmRlckxpbmUocmVuZGVyZWRMaW5lTnVtYmVyLCBkZWx0YVRvcFtpXSwgdGhpcy5fbGluZUhlaWdodEZvckxpbmVOdW1iZXIocmVuZGVyZWRMaW5lTnVtYmVyKSwgdGhpcy5fdmlld3BvcnREYXRhLCBzYik7XG5cdFx0XHRcdGlmICghcmVuZGVyUmVzdWx0KSB7XG5cdFx0XHRcdFx0Ly8gbGluZSBkb2VzIG5vdCBuZWVkIHJlbmRlcmluZ1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0d2FzSW52YWxpZFtpXSA9IHRydWU7XG5cdFx0XHRcdGhhZEludmFsaWRMaW5lID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhhZEludmFsaWRMaW5lKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaFJlbmRlcmluZ0ludmFsaWRMaW5lcyhjdHgsIHNiLmJ1aWxkKCksIHdhc0ludmFsaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdDb250ZXh0LnZpZXdMYXlvdXQuZ2V0TGluZUhlaWdodEZvckxpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQXNCLHlCQUF5QjtBQUMvQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQWlDdkIsTUFBTSx3QkFBeUM7QUFBQSxFQUlyRCxZQUNrQixjQUNoQjtBQURnQjtBQUVqQixTQUFLLEtBQUssR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNoQjtBQUFBLEVBRU8sUUFBYztBQUNwQixTQUFLLEtBQUssR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNoQjtBQUFBLEVBRUEsS0FBSyxxQkFBNkIsT0FBa0I7QUFDbkQsU0FBSyxTQUFTO0FBQ2QsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBLEVBRUEsT0FBb0Q7QUFDbkQsV0FBTztBQUFBLE1BQ04scUJBQXFCLEtBQUs7QUFBQSxNQUMxQixPQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08scUJBQTZCO0FBQ25DLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLG1CQUEyQjtBQUNqQyxXQUFPLEtBQUssdUJBQXVCLEtBQUssT0FBTyxTQUFTO0FBQUEsRUFDekQ7QUFBQSxFQUVPLFdBQW1CO0FBQ3pCLFdBQU8sS0FBSyxPQUFPO0FBQUEsRUFDcEI7QUFBQSxFQUVPLFFBQVEsWUFBdUI7QUFDckMsVUFBTSxZQUFZLGFBQWEsS0FBSztBQUNwQyxRQUFJLFlBQVksS0FBSyxhQUFhLEtBQUssT0FBTyxRQUFRO0FBQ3JELFlBQU0sSUFBSSxtQkFBbUIsOEJBQThCO0FBQUEsSUFDNUQ7QUFDQSxX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
