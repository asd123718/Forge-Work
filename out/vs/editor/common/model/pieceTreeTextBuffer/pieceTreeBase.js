import { CharCode } from "../../../../base/common/charCode.js";
import { Position } from "../../core/position.js";
import { Range } from "../../core/range.js";
import { FindMatch } from "../../model.js";
import { NodeColor, SENTINEL, TreeNode, fixInsert, leftest, rbDelete, righttest, updateTreeMetadata } from "./rbTreeBase.js";
import { Searcher, createFindMatch, isValidMatch } from "../textModelSearch.js";
const AverageBufferSize = 65535;
function createUintArray(arr) {
  let r;
  if (arr[arr.length - 1] < 65536) {
    r = new Uint16Array(arr.length);
  } else {
    r = new Uint32Array(arr.length);
  }
  r.set(arr, 0);
  return r;
}
class LineStarts {
  constructor(lineStarts, cr, lf, crlf, isBasicASCII) {
    this.lineStarts = lineStarts;
    this.cr = cr;
    this.lf = lf;
    this.crlf = crlf;
    this.isBasicASCII = isBasicASCII;
  }
}
function createLineStartsFast(str, readonly = true) {
  const r = [0];
  let rLength = 1;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    if (chr === CharCode.CarriageReturn) {
      if (i + 1 < len && str.charCodeAt(i + 1) === CharCode.LineFeed) {
        r[rLength++] = i + 2;
        i++;
      } else {
        r[rLength++] = i + 1;
      }
    } else if (chr === CharCode.LineFeed) {
      r[rLength++] = i + 1;
    }
  }
  if (readonly) {
    return createUintArray(r);
  } else {
    return r;
  }
}
function createLineStarts(r, str) {
  r.length = 0;
  r[0] = 0;
  let rLength = 1;
  let cr = 0, lf = 0, crlf = 0;
  let isBasicASCII = true;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    if (chr === CharCode.CarriageReturn) {
      if (i + 1 < len && str.charCodeAt(i + 1) === CharCode.LineFeed) {
        crlf++;
        r[rLength++] = i + 2;
        i++;
      } else {
        cr++;
        r[rLength++] = i + 1;
      }
    } else if (chr === CharCode.LineFeed) {
      lf++;
      r[rLength++] = i + 1;
    } else {
      if (isBasicASCII) {
        if (chr !== CharCode.Tab && (chr < 32 || chr > 126)) {
          isBasicASCII = false;
        }
      }
    }
  }
  const result = new LineStarts(createUintArray(r), cr, lf, crlf, isBasicASCII);
  r.length = 0;
  return result;
}
class Piece {
  constructor(bufferIndex, start, end, lineFeedCnt, length) {
    this.bufferIndex = bufferIndex;
    this.start = start;
    this.end = end;
    this.lineFeedCnt = lineFeedCnt;
    this.length = length;
  }
}
class StringBuffer {
  constructor(buffer, lineStarts) {
    this.buffer = buffer;
    this.lineStarts = lineStarts;
  }
}
class PieceTreeSnapshot {
  constructor(tree, BOM) {
    this._pieces = [];
    this._tree = tree;
    this._BOM = BOM;
    this._index = 0;
    if (tree.root !== SENTINEL) {
      tree.iterate(tree.root, (node) => {
        if (node !== SENTINEL) {
          this._pieces.push(node.piece);
        }
        return true;
      });
    }
  }
  read() {
    if (this._pieces.length === 0) {
      if (this._index === 0) {
        this._index++;
        return this._BOM;
      } else {
        return null;
      }
    }
    if (this._index > this._pieces.length - 1) {
      return null;
    }
    if (this._index === 0) {
      return this._BOM + this._tree.getPieceContent(this._pieces[this._index++]);
    }
    return this._tree.getPieceContent(this._pieces[this._index++]);
  }
}
class PieceTreeSearchCache {
  constructor(limit) {
    this._limit = limit;
    this._cache = [];
  }
  get(offset) {
    for (let i = this._cache.length - 1; i >= 0; i--) {
      const nodePos = this._cache[i];
      if (nodePos.nodeStartOffset <= offset && nodePos.nodeStartOffset + nodePos.node.piece.length >= offset) {
        return nodePos;
      }
    }
    return null;
  }
  get2(lineNumber) {
    for (let i = this._cache.length - 1; i >= 0; i--) {
      const nodePos = this._cache[i];
      if (nodePos.nodeStartLineNumber && nodePos.nodeStartLineNumber < lineNumber && nodePos.nodeStartLineNumber + nodePos.node.piece.lineFeedCnt >= lineNumber) {
        return nodePos;
      }
    }
    return null;
  }
  set(nodePosition) {
    if (this._cache.length >= this._limit) {
      this._cache.shift();
    }
    this._cache.push(nodePosition);
  }
  validate(offset) {
    let hasInvalidVal = false;
    const tmp = this._cache;
    for (let i = 0; i < tmp.length; i++) {
      const nodePos = tmp[i];
      if (nodePos.node.parent === null || nodePos.nodeStartOffset >= offset) {
        tmp[i] = null;
        hasInvalidVal = true;
        continue;
      }
    }
    if (hasInvalidVal) {
      const newArr = [];
      for (const entry of tmp) {
        if (entry !== null) {
          newArr.push(entry);
        }
      }
      this._cache = newArr;
    }
  }
}
class PieceTreeBase {
  constructor(chunks, eol, eolNormalized) {
    this.create(chunks, eol, eolNormalized);
  }
  create(chunks, eol, eolNormalized) {
    this._buffers = [
      new StringBuffer("", [0])
    ];
    this._lastChangeBufferPos = { line: 0, column: 0 };
    this.root = SENTINEL;
    this._lineCnt = 1;
    this._length = 0;
    this._EOL = eol;
    this._EOLLength = eol.length;
    this._EOLNormalized = eolNormalized;
    let lastNode = null;
    for (let i = 0, len = chunks.length; i < len; i++) {
      if (chunks[i].buffer.length > 0) {
        if (!chunks[i].lineStarts) {
          chunks[i].lineStarts = createLineStartsFast(chunks[i].buffer);
        }
        const piece = new Piece(
          i + 1,
          { line: 0, column: 0 },
          { line: chunks[i].lineStarts.length - 1, column: chunks[i].buffer.length - chunks[i].lineStarts[chunks[i].lineStarts.length - 1] },
          chunks[i].lineStarts.length - 1,
          chunks[i].buffer.length
        );
        this._buffers.push(chunks[i]);
        lastNode = this.rbInsertRight(lastNode, piece);
      }
    }
    this._searchCache = new PieceTreeSearchCache(1);
    this._lastVisitedLine = { lineNumber: 0, value: "" };
    this.computeBufferMetadata();
  }
  normalizeEOL(eol) {
    const averageBufferSize = AverageBufferSize;
    const min = averageBufferSize - Math.floor(averageBufferSize / 3);
    const max = min * 2;
    let tempChunk = "";
    let tempChunkLen = 0;
    const chunks = [];
    this.iterate(this.root, (node) => {
      const str = this.getNodeContent(node);
      const len = str.length;
      if (tempChunkLen <= min || tempChunkLen + len < max) {
        tempChunk += str;
        tempChunkLen += len;
        return true;
      }
      const text = tempChunk.replace(/\r\n|\r|\n/g, eol);
      chunks.push(new StringBuffer(text, createLineStartsFast(text)));
      tempChunk = str;
      tempChunkLen = len;
      return true;
    });
    if (tempChunkLen > 0) {
      const text = tempChunk.replace(/\r\n|\r|\n/g, eol);
      chunks.push(new StringBuffer(text, createLineStartsFast(text)));
    }
    this.create(chunks, eol, true);
  }
  // #region Buffer API
  getEOL() {
    return this._EOL;
  }
  setEOL(newEOL) {
    this._EOL = newEOL;
    this._EOLLength = this._EOL.length;
    this.normalizeEOL(newEOL);
  }
  createSnapshot(BOM) {
    return new PieceTreeSnapshot(this, BOM);
  }
  equal(other) {
    if (this.getLength() !== other.getLength()) {
      return false;
    }
    if (this.getLineCount() !== other.getLineCount()) {
      return false;
    }
    let offset = 0;
    const ret = this.iterate(this.root, (node) => {
      if (node === SENTINEL) {
        return true;
      }
      const str = this.getNodeContent(node);
      const len = str.length;
      const startPosition = other.nodeAt(offset);
      const endPosition = other.nodeAt(offset + len);
      const val = other.getValueInRange2(startPosition, endPosition);
      offset += len;
      return str === val;
    });
    return ret;
  }
  getOffsetAt(lineNumber, column) {
    let leftLen = 0;
    let x = this.root;
    while (x !== SENTINEL) {
      if (x.left !== SENTINEL && x.lf_left + 1 >= lineNumber) {
        x = x.left;
      } else if (x.lf_left + x.piece.lineFeedCnt + 1 >= lineNumber) {
        leftLen += x.size_left;
        const accumualtedValInCurrentIndex = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
        return leftLen += accumualtedValInCurrentIndex + column - 1;
      } else {
        lineNumber -= x.lf_left + x.piece.lineFeedCnt;
        leftLen += x.size_left + x.piece.length;
        x = x.right;
      }
    }
    return leftLen;
  }
  getPositionAt(offset) {
    offset = Math.floor(offset);
    offset = Math.max(0, offset);
    let x = this.root;
    let lfCnt = 0;
    const originalOffset = offset;
    while (x !== SENTINEL) {
      if (x.size_left !== 0 && x.size_left >= offset) {
        x = x.left;
      } else if (x.size_left + x.piece.length >= offset) {
        const out = this.getIndexOf(x, offset - x.size_left);
        lfCnt += x.lf_left + out.index;
        if (out.index === 0) {
          const lineStartOffset = this.getOffsetAt(lfCnt + 1, 1);
          const column = originalOffset - lineStartOffset;
          return new Position(lfCnt + 1, column + 1);
        }
        return new Position(lfCnt + 1, out.remainder + 1);
      } else {
        offset -= x.size_left + x.piece.length;
        lfCnt += x.lf_left + x.piece.lineFeedCnt;
        if (x.right === SENTINEL) {
          const lineStartOffset = this.getOffsetAt(lfCnt + 1, 1);
          const column = originalOffset - offset - lineStartOffset;
          return new Position(lfCnt + 1, column + 1);
        } else {
          x = x.right;
        }
      }
    }
    return new Position(1, 1);
  }
  getValueInRange(range, eol) {
    if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
      return "";
    }
    const startPosition = this.nodeAt2(range.startLineNumber, range.startColumn);
    const endPosition = this.nodeAt2(range.endLineNumber, range.endColumn);
    const value = this.getValueInRange2(startPosition, endPosition);
    if (eol) {
      if (eol !== this._EOL || !this._EOLNormalized) {
        return value.replace(/\r\n|\r|\n/g, eol);
      }
      if (eol === this.getEOL() && this._EOLNormalized) {
        if (eol === "\r\n") {
        }
        return value;
      }
      return value.replace(/\r\n|\r|\n/g, eol);
    }
    return value;
  }
  getValueInRange2(startPosition, endPosition) {
    if (startPosition.node === endPosition.node) {
      const node = startPosition.node;
      const buffer2 = this._buffers[node.piece.bufferIndex].buffer;
      const startOffset2 = this.offsetInBuffer(node.piece.bufferIndex, node.piece.start);
      return buffer2.substring(startOffset2 + startPosition.remainder, startOffset2 + endPosition.remainder);
    }
    let x = startPosition.node;
    const buffer = this._buffers[x.piece.bufferIndex].buffer;
    const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
    let ret = buffer.substring(startOffset + startPosition.remainder, startOffset + x.piece.length);
    x = x.next();
    while (x !== SENTINEL) {
      const buffer2 = this._buffers[x.piece.bufferIndex].buffer;
      const startOffset2 = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
      if (x === endPosition.node) {
        ret += buffer2.substring(startOffset2, startOffset2 + endPosition.remainder);
        break;
      } else {
        ret += buffer2.substr(startOffset2, x.piece.length);
      }
      x = x.next();
    }
    return ret;
  }
  getLinesContent() {
    const lines = [];
    let linesLength = 0;
    let currentLine = "";
    let danglingCR = false;
    this.iterate(this.root, (node) => {
      if (node === SENTINEL) {
        return true;
      }
      const piece = node.piece;
      let pieceLength = piece.length;
      if (pieceLength === 0) {
        return true;
      }
      const buffer = this._buffers[piece.bufferIndex].buffer;
      const lineStarts = this._buffers[piece.bufferIndex].lineStarts;
      const pieceStartLine = piece.start.line;
      const pieceEndLine = piece.end.line;
      let pieceStartOffset = lineStarts[pieceStartLine] + piece.start.column;
      if (danglingCR) {
        if (buffer.charCodeAt(pieceStartOffset) === CharCode.LineFeed) {
          pieceStartOffset++;
          pieceLength--;
        }
        lines[linesLength++] = currentLine;
        currentLine = "";
        danglingCR = false;
        if (pieceLength === 0) {
          return true;
        }
      }
      if (pieceStartLine === pieceEndLine) {
        if (!this._EOLNormalized && buffer.charCodeAt(pieceStartOffset + pieceLength - 1) === CharCode.CarriageReturn) {
          danglingCR = true;
          currentLine += buffer.substr(pieceStartOffset, pieceLength - 1);
        } else {
          currentLine += buffer.substr(pieceStartOffset, pieceLength);
        }
        return true;
      }
      currentLine += this._EOLNormalized ? buffer.substring(pieceStartOffset, Math.max(pieceStartOffset, lineStarts[pieceStartLine + 1] - this._EOLLength)) : buffer.substring(pieceStartOffset, lineStarts[pieceStartLine + 1]).replace(/(\r\n|\r|\n)$/, "");
      lines[linesLength++] = currentLine;
      for (let line = pieceStartLine + 1; line < pieceEndLine; line++) {
        currentLine = this._EOLNormalized ? buffer.substring(lineStarts[line], lineStarts[line + 1] - this._EOLLength) : buffer.substring(lineStarts[line], lineStarts[line + 1]).replace(/(\r\n|\r|\n)$/, "");
        lines[linesLength++] = currentLine;
      }
      if (!this._EOLNormalized && buffer.charCodeAt(lineStarts[pieceEndLine] + piece.end.column - 1) === CharCode.CarriageReturn) {
        danglingCR = true;
        if (piece.end.column === 0) {
          linesLength--;
        } else {
          currentLine = buffer.substr(lineStarts[pieceEndLine], piece.end.column - 1);
        }
      } else {
        currentLine = buffer.substr(lineStarts[pieceEndLine], piece.end.column);
      }
      return true;
    });
    if (danglingCR) {
      lines[linesLength++] = currentLine;
      currentLine = "";
    }
    lines[linesLength++] = currentLine;
    return lines;
  }
  getLength() {
    return this._length;
  }
  getLineCount() {
    return this._lineCnt;
  }
  getLineContent(lineNumber) {
    if (this._lastVisitedLine.lineNumber === lineNumber) {
      return this._lastVisitedLine.value;
    }
    this._lastVisitedLine.lineNumber = lineNumber;
    if (lineNumber === this._lineCnt) {
      this._lastVisitedLine.value = this.getLineRawContent(lineNumber);
    } else if (this._EOLNormalized) {
      this._lastVisitedLine.value = this.getLineRawContent(lineNumber, this._EOLLength);
    } else {
      this._lastVisitedLine.value = this.getLineRawContent(lineNumber).replace(/(\r\n|\r|\n)$/, "");
    }
    return this._lastVisitedLine.value;
  }
  _getCharCode(nodePos) {
    if (nodePos.remainder === nodePos.node.piece.length) {
      const matchingNode = nodePos.node.next();
      if (!matchingNode) {
        return 0;
      }
      const buffer = this._buffers[matchingNode.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(matchingNode.piece.bufferIndex, matchingNode.piece.start);
      return buffer.buffer.charCodeAt(startOffset);
    } else {
      const buffer = this._buffers[nodePos.node.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(nodePos.node.piece.bufferIndex, nodePos.node.piece.start);
      const targetOffset = startOffset + nodePos.remainder;
      return buffer.buffer.charCodeAt(targetOffset);
    }
  }
  getLineCharCode(lineNumber, index) {
    const nodePos = this.nodeAt2(lineNumber, index + 1);
    return this._getCharCode(nodePos);
  }
  getLineLength(lineNumber) {
    if (lineNumber === this.getLineCount()) {
      const startOffset = this.getOffsetAt(lineNumber, 1);
      return this.getLength() - startOffset;
    }
    return this.getOffsetAt(lineNumber + 1, 1) - this.getOffsetAt(lineNumber, 1) - this._EOLLength;
  }
  getCharCode(offset) {
    const nodePos = this.nodeAt(offset);
    return this._getCharCode(nodePos);
  }
  getNearestChunk(offset) {
    const nodePos = this.nodeAt(offset);
    if (nodePos.remainder === nodePos.node.piece.length) {
      const matchingNode = nodePos.node.next();
      if (!matchingNode || matchingNode === SENTINEL) {
        return "";
      }
      const buffer = this._buffers[matchingNode.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(matchingNode.piece.bufferIndex, matchingNode.piece.start);
      return buffer.buffer.substring(startOffset, startOffset + matchingNode.piece.length);
    } else {
      const buffer = this._buffers[nodePos.node.piece.bufferIndex];
      const startOffset = this.offsetInBuffer(nodePos.node.piece.bufferIndex, nodePos.node.piece.start);
      const targetOffset = startOffset + nodePos.remainder;
      const targetEnd = startOffset + nodePos.node.piece.length;
      return buffer.buffer.substring(targetOffset, targetEnd);
    }
  }
  findMatchesInNode(node, searcher, startLineNumber, startColumn, startCursor, endCursor, searchData, captureMatches, limitResultCount, resultLen, result) {
    const buffer = this._buffers[node.piece.bufferIndex];
    const startOffsetInBuffer = this.offsetInBuffer(node.piece.bufferIndex, node.piece.start);
    const start = this.offsetInBuffer(node.piece.bufferIndex, startCursor);
    const end = this.offsetInBuffer(node.piece.bufferIndex, endCursor);
    let m;
    const ret = { line: 0, column: 0 };
    let searchText;
    let offsetInBuffer;
    if (searcher._wordSeparators) {
      searchText = buffer.buffer.substring(start, end);
      offsetInBuffer = (offset) => offset + start;
      searcher.reset(0);
    } else {
      searchText = buffer.buffer;
      offsetInBuffer = (offset) => offset;
      searcher.reset(start);
    }
    do {
      m = searcher.next(searchText);
      if (m) {
        if (offsetInBuffer(m.index) >= end) {
          return resultLen;
        }
        this.positionInBuffer(node, offsetInBuffer(m.index) - startOffsetInBuffer, ret);
        const lineFeedCnt = this.getLineFeedCnt(node.piece.bufferIndex, startCursor, ret);
        const retStartColumn = ret.line === startCursor.line ? ret.column - startCursor.column + startColumn : ret.column + 1;
        const retEndColumn = retStartColumn + m[0].length;
        result[resultLen++] = createFindMatch(new Range(startLineNumber + lineFeedCnt, retStartColumn, startLineNumber + lineFeedCnt, retEndColumn), m, captureMatches);
        if (offsetInBuffer(m.index) + m[0].length >= end) {
          return resultLen;
        }
        if (resultLen >= limitResultCount) {
          return resultLen;
        }
      }
    } while (m);
    return resultLen;
  }
  findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount) {
    const result = [];
    let resultLen = 0;
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    let startPosition = this.nodeAt2(searchRange.startLineNumber, searchRange.startColumn);
    if (startPosition === null) {
      return [];
    }
    const endPosition = this.nodeAt2(searchRange.endLineNumber, searchRange.endColumn);
    if (endPosition === null) {
      return [];
    }
    let start = this.positionInBuffer(startPosition.node, startPosition.remainder);
    const end = this.positionInBuffer(endPosition.node, endPosition.remainder);
    if (startPosition.node === endPosition.node) {
      this.findMatchesInNode(startPosition.node, searcher, searchRange.startLineNumber, searchRange.startColumn, start, end, searchData, captureMatches, limitResultCount, resultLen, result);
      return result;
    }
    let startLineNumber = searchRange.startLineNumber;
    let currentNode = startPosition.node;
    while (currentNode !== endPosition.node) {
      const lineBreakCnt = this.getLineFeedCnt(currentNode.piece.bufferIndex, start, currentNode.piece.end);
      if (lineBreakCnt >= 1) {
        const lineStarts = this._buffers[currentNode.piece.bufferIndex].lineStarts;
        const startOffsetInBuffer = this.offsetInBuffer(currentNode.piece.bufferIndex, currentNode.piece.start);
        const nextLineStartOffset = lineStarts[start.line + lineBreakCnt];
        const startColumn3 = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn : 1;
        resultLen = this.findMatchesInNode(currentNode, searcher, startLineNumber, startColumn3, start, this.positionInBuffer(currentNode, nextLineStartOffset - startOffsetInBuffer), searchData, captureMatches, limitResultCount, resultLen, result);
        if (resultLen >= limitResultCount) {
          return result;
        }
        startLineNumber += lineBreakCnt;
      }
      const startColumn2 = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn - 1 : 0;
      if (startLineNumber === searchRange.endLineNumber) {
        const text = this.getLineContent(startLineNumber).substring(startColumn2, searchRange.endColumn - 1);
        resultLen = this._findMatchesInLine(searchData, searcher, text, searchRange.endLineNumber, startColumn2, resultLen, result, captureMatches, limitResultCount);
        return result;
      }
      resultLen = this._findMatchesInLine(searchData, searcher, this.getLineContent(startLineNumber).substr(startColumn2), startLineNumber, startColumn2, resultLen, result, captureMatches, limitResultCount);
      if (resultLen >= limitResultCount) {
        return result;
      }
      startLineNumber++;
      startPosition = this.nodeAt2(startLineNumber, 1);
      currentNode = startPosition.node;
      start = this.positionInBuffer(startPosition.node, startPosition.remainder);
    }
    if (startLineNumber === searchRange.endLineNumber) {
      const startColumn2 = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn - 1 : 0;
      const text = this.getLineContent(startLineNumber).substring(startColumn2, searchRange.endColumn - 1);
      resultLen = this._findMatchesInLine(searchData, searcher, text, searchRange.endLineNumber, startColumn2, resultLen, result, captureMatches, limitResultCount);
      return result;
    }
    const startColumn = startLineNumber === searchRange.startLineNumber ? searchRange.startColumn : 1;
    resultLen = this.findMatchesInNode(endPosition.node, searcher, startLineNumber, startColumn, start, end, searchData, captureMatches, limitResultCount, resultLen, result);
    return result;
  }
  _findMatchesInLine(searchData, searcher, text, lineNumber, deltaOffset, resultLen, result, captureMatches, limitResultCount) {
    const wordSeparators = searchData.wordSeparators;
    if (!captureMatches && searchData.simpleSearch) {
      const searchString = searchData.simpleSearch;
      const searchStringLen = searchString.length;
      const textLength = text.length;
      let lastMatchIndex = -searchStringLen;
      while ((lastMatchIndex = text.indexOf(searchString, lastMatchIndex + searchStringLen)) !== -1) {
        if (!wordSeparators || isValidMatch(wordSeparators, text, textLength, lastMatchIndex, searchStringLen)) {
          result[resultLen++] = new FindMatch(new Range(lineNumber, lastMatchIndex + 1 + deltaOffset, lineNumber, lastMatchIndex + 1 + searchStringLen + deltaOffset), null);
          if (resultLen >= limitResultCount) {
            return resultLen;
          }
        }
      }
      return resultLen;
    }
    let m;
    searcher.reset(0);
    do {
      m = searcher.next(text);
      if (m) {
        result[resultLen++] = createFindMatch(new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset), m, captureMatches);
        if (resultLen >= limitResultCount) {
          return resultLen;
        }
      }
    } while (m);
    return resultLen;
  }
  // #endregion
  // #region Piece Table
  insert(offset, value, eolNormalized = false) {
    this._EOLNormalized = this._EOLNormalized && eolNormalized;
    this._lastVisitedLine.lineNumber = 0;
    this._lastVisitedLine.value = "";
    if (this.root !== SENTINEL) {
      const { node, remainder, nodeStartOffset } = this.nodeAt(offset);
      const piece = node.piece;
      const bufferIndex = piece.bufferIndex;
      const insertPosInBuffer = this.positionInBuffer(node, remainder);
      if (node.piece.bufferIndex === 0 && piece.end.line === this._lastChangeBufferPos.line && piece.end.column === this._lastChangeBufferPos.column && nodeStartOffset + piece.length === offset && value.length < AverageBufferSize) {
        this.appendToNode(node, value);
        this.computeBufferMetadata();
        return;
      }
      if (nodeStartOffset === offset) {
        this.insertContentToNodeLeft(value, node);
        this._searchCache.validate(offset);
      } else if (nodeStartOffset + node.piece.length > offset) {
        const nodesToDel = [];
        let newRightPiece = new Piece(
          piece.bufferIndex,
          insertPosInBuffer,
          piece.end,
          this.getLineFeedCnt(piece.bufferIndex, insertPosInBuffer, piece.end),
          this.offsetInBuffer(bufferIndex, piece.end) - this.offsetInBuffer(bufferIndex, insertPosInBuffer)
        );
        if (this.shouldCheckCRLF() && this.endWithCR(value)) {
          const headOfRight = this.nodeCharCodeAt(node, remainder);
          if (headOfRight === 10) {
            const newStart = { line: newRightPiece.start.line + 1, column: 0 };
            newRightPiece = new Piece(
              newRightPiece.bufferIndex,
              newStart,
              newRightPiece.end,
              this.getLineFeedCnt(newRightPiece.bufferIndex, newStart, newRightPiece.end),
              newRightPiece.length - 1
            );
            value += "\n";
          }
        }
        if (this.shouldCheckCRLF() && this.startWithLF(value)) {
          const tailOfLeft = this.nodeCharCodeAt(node, remainder - 1);
          if (tailOfLeft === 13) {
            const previousPos = this.positionInBuffer(node, remainder - 1);
            this.deleteNodeTail(node, previousPos);
            value = "\r" + value;
            if (node.piece.length === 0) {
              nodesToDel.push(node);
            }
          } else {
            this.deleteNodeTail(node, insertPosInBuffer);
          }
        } else {
          this.deleteNodeTail(node, insertPosInBuffer);
        }
        const newPieces = this.createNewPieces(value);
        if (newRightPiece.length > 0) {
          this.rbInsertRight(node, newRightPiece);
        }
        let tmpNode = node;
        for (let k = 0; k < newPieces.length; k++) {
          tmpNode = this.rbInsertRight(tmpNode, newPieces[k]);
        }
        this.deleteNodes(nodesToDel);
      } else {
        this.insertContentToNodeRight(value, node);
      }
    } else {
      const pieces = this.createNewPieces(value);
      let node = this.rbInsertLeft(null, pieces[0]);
      for (let k = 1; k < pieces.length; k++) {
        node = this.rbInsertRight(node, pieces[k]);
      }
    }
    this.computeBufferMetadata();
  }
  delete(offset, cnt) {
    this._lastVisitedLine.lineNumber = 0;
    this._lastVisitedLine.value = "";
    if (cnt <= 0 || this.root === SENTINEL) {
      return;
    }
    const startPosition = this.nodeAt(offset);
    const endPosition = this.nodeAt(offset + cnt);
    const startNode = startPosition.node;
    const endNode = endPosition.node;
    if (startNode === endNode) {
      const startSplitPosInBuffer2 = this.positionInBuffer(startNode, startPosition.remainder);
      const endSplitPosInBuffer2 = this.positionInBuffer(startNode, endPosition.remainder);
      if (startPosition.nodeStartOffset === offset) {
        if (cnt === startNode.piece.length) {
          const next = startNode.next();
          rbDelete(this, startNode);
          this.validateCRLFWithPrevNode(next);
          this.computeBufferMetadata();
          return;
        }
        this.deleteNodeHead(startNode, endSplitPosInBuffer2);
        this._searchCache.validate(offset);
        this.validateCRLFWithPrevNode(startNode);
        this.computeBufferMetadata();
        return;
      }
      if (startPosition.nodeStartOffset + startNode.piece.length === offset + cnt) {
        this.deleteNodeTail(startNode, startSplitPosInBuffer2);
        this.validateCRLFWithNextNode(startNode);
        this.computeBufferMetadata();
        return;
      }
      this.shrinkNode(startNode, startSplitPosInBuffer2, endSplitPosInBuffer2);
      this.computeBufferMetadata();
      return;
    }
    const nodesToDel = [];
    const startSplitPosInBuffer = this.positionInBuffer(startNode, startPosition.remainder);
    this.deleteNodeTail(startNode, startSplitPosInBuffer);
    this._searchCache.validate(offset);
    if (startNode.piece.length === 0) {
      nodesToDel.push(startNode);
    }
    const endSplitPosInBuffer = this.positionInBuffer(endNode, endPosition.remainder);
    this.deleteNodeHead(endNode, endSplitPosInBuffer);
    if (endNode.piece.length === 0) {
      nodesToDel.push(endNode);
    }
    const secondNode = startNode.next();
    for (let node = secondNode; node !== SENTINEL && node !== endNode; node = node.next()) {
      nodesToDel.push(node);
    }
    const prev = startNode.piece.length === 0 ? startNode.prev() : startNode;
    this.deleteNodes(nodesToDel);
    this.validateCRLFWithNextNode(prev);
    this.computeBufferMetadata();
  }
  insertContentToNodeLeft(value, node) {
    const nodesToDel = [];
    if (this.shouldCheckCRLF() && this.endWithCR(value) && this.startWithLF(node)) {
      const piece = node.piece;
      const newStart = { line: piece.start.line + 1, column: 0 };
      const nPiece = new Piece(
        piece.bufferIndex,
        newStart,
        piece.end,
        this.getLineFeedCnt(piece.bufferIndex, newStart, piece.end),
        piece.length - 1
      );
      node.piece = nPiece;
      value += "\n";
      updateTreeMetadata(this, node, -1, -1);
      if (node.piece.length === 0) {
        nodesToDel.push(node);
      }
    }
    const newPieces = this.createNewPieces(value);
    let newNode = this.rbInsertLeft(node, newPieces[newPieces.length - 1]);
    for (let k = newPieces.length - 2; k >= 0; k--) {
      newNode = this.rbInsertLeft(newNode, newPieces[k]);
    }
    this.validateCRLFWithPrevNode(newNode);
    this.deleteNodes(nodesToDel);
  }
  insertContentToNodeRight(value, node) {
    if (this.adjustCarriageReturnFromNext(value, node)) {
      value += "\n";
    }
    const newPieces = this.createNewPieces(value);
    const newNode = this.rbInsertRight(node, newPieces[0]);
    let tmpNode = newNode;
    for (let k = 1; k < newPieces.length; k++) {
      tmpNode = this.rbInsertRight(tmpNode, newPieces[k]);
    }
    this.validateCRLFWithPrevNode(newNode);
  }
  positionInBuffer(node, remainder, ret) {
    const piece = node.piece;
    const bufferIndex = node.piece.bufferIndex;
    const lineStarts = this._buffers[bufferIndex].lineStarts;
    const startOffset = lineStarts[piece.start.line] + piece.start.column;
    const offset = startOffset + remainder;
    let low = piece.start.line;
    let high = piece.end.line;
    let mid = 0;
    let midStop = 0;
    let midStart = 0;
    while (low <= high) {
      mid = low + (high - low) / 2 | 0;
      midStart = lineStarts[mid];
      if (mid === high) {
        break;
      }
      midStop = lineStarts[mid + 1];
      if (offset < midStart) {
        high = mid - 1;
      } else if (offset >= midStop) {
        low = mid + 1;
      } else {
        break;
      }
    }
    if (ret) {
      ret.line = mid;
      ret.column = offset - midStart;
      return null;
    }
    return {
      line: mid,
      column: offset - midStart
    };
  }
  getLineFeedCnt(bufferIndex, start, end) {
    if (end.column === 0) {
      return end.line - start.line;
    }
    const lineStarts = this._buffers[bufferIndex].lineStarts;
    if (end.line === lineStarts.length - 1) {
      return end.line - start.line;
    }
    const nextLineStartOffset = lineStarts[end.line + 1];
    const endOffset = lineStarts[end.line] + end.column;
    if (nextLineStartOffset > endOffset + 1) {
      return end.line - start.line;
    }
    const previousCharOffset = endOffset - 1;
    const buffer = this._buffers[bufferIndex].buffer;
    if (buffer.charCodeAt(previousCharOffset) === 13) {
      return end.line - start.line + 1;
    } else {
      return end.line - start.line;
    }
  }
  offsetInBuffer(bufferIndex, cursor) {
    const lineStarts = this._buffers[bufferIndex].lineStarts;
    return lineStarts[cursor.line] + cursor.column;
  }
  deleteNodes(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      rbDelete(this, nodes[i]);
    }
  }
  createNewPieces(text) {
    if (text.length > AverageBufferSize) {
      const newPieces = [];
      while (text.length > AverageBufferSize) {
        const lastChar = text.charCodeAt(AverageBufferSize - 1);
        let splitText;
        if (lastChar === CharCode.CarriageReturn || lastChar >= 55296 && lastChar <= 56319) {
          splitText = text.substring(0, AverageBufferSize - 1);
          text = text.substring(AverageBufferSize - 1);
        } else {
          splitText = text.substring(0, AverageBufferSize);
          text = text.substring(AverageBufferSize);
        }
        const lineStarts3 = createLineStartsFast(splitText);
        newPieces.push(new Piece(
          this._buffers.length,
          /* buffer index */
          { line: 0, column: 0 },
          { line: lineStarts3.length - 1, column: splitText.length - lineStarts3[lineStarts3.length - 1] },
          lineStarts3.length - 1,
          splitText.length
        ));
        this._buffers.push(new StringBuffer(splitText, lineStarts3));
      }
      const lineStarts2 = createLineStartsFast(text);
      newPieces.push(new Piece(
        this._buffers.length,
        /* buffer index */
        { line: 0, column: 0 },
        { line: lineStarts2.length - 1, column: text.length - lineStarts2[lineStarts2.length - 1] },
        lineStarts2.length - 1,
        text.length
      ));
      this._buffers.push(new StringBuffer(text, lineStarts2));
      return newPieces;
    }
    let startOffset = this._buffers[0].buffer.length;
    const lineStarts = createLineStartsFast(text, false);
    let start = this._lastChangeBufferPos;
    if (this._buffers[0].lineStarts[this._buffers[0].lineStarts.length - 1] === startOffset && startOffset !== 0 && this.startWithLF(text) && this.endWithCR(this._buffers[0].buffer)) {
      this._lastChangeBufferPos = { line: this._lastChangeBufferPos.line, column: this._lastChangeBufferPos.column + 1 };
      start = this._lastChangeBufferPos;
      for (let i = 0; i < lineStarts.length; i++) {
        lineStarts[i] += startOffset + 1;
      }
      this._buffers[0].lineStarts = this._buffers[0].lineStarts.concat(lineStarts.slice(1));
      this._buffers[0].buffer += "_" + text;
      startOffset += 1;
    } else {
      if (startOffset !== 0) {
        for (let i = 0; i < lineStarts.length; i++) {
          lineStarts[i] += startOffset;
        }
      }
      this._buffers[0].lineStarts = this._buffers[0].lineStarts.concat(lineStarts.slice(1));
      this._buffers[0].buffer += text;
    }
    const endOffset = this._buffers[0].buffer.length;
    const endIndex = this._buffers[0].lineStarts.length - 1;
    const endColumn = endOffset - this._buffers[0].lineStarts[endIndex];
    const endPos = { line: endIndex, column: endColumn };
    const newPiece = new Piece(
      0,
      /** todo@peng */
      start,
      endPos,
      this.getLineFeedCnt(0, start, endPos),
      endOffset - startOffset
    );
    this._lastChangeBufferPos = endPos;
    return [newPiece];
  }
  getLinesRawContent() {
    return this.getContentOfSubTree(this.root);
  }
  getLineRawContent(lineNumber, endOffset = 0) {
    let x = this.root;
    let ret = "";
    const cache = this._searchCache.get2(lineNumber);
    if (cache) {
      x = cache.node;
      const prevAccumulatedValue = this.getAccumulatedValue(x, lineNumber - cache.nodeStartLineNumber - 1);
      const buffer = this._buffers[x.piece.bufferIndex].buffer;
      const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
      if (cache.nodeStartLineNumber + x.piece.lineFeedCnt === lineNumber) {
        ret = buffer.substring(startOffset + prevAccumulatedValue, startOffset + x.piece.length);
      } else {
        const accumulatedValue = this.getAccumulatedValue(x, lineNumber - cache.nodeStartLineNumber);
        return buffer.substring(startOffset + prevAccumulatedValue, startOffset + accumulatedValue - endOffset);
      }
    } else {
      let nodeStartOffset = 0;
      const originalLineNumber = lineNumber;
      while (x !== SENTINEL) {
        if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
          x = x.left;
        } else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
          const prevAccumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
          const accumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 1);
          const buffer = this._buffers[x.piece.bufferIndex].buffer;
          const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
          nodeStartOffset += x.size_left;
          this._searchCache.set({
            node: x,
            nodeStartOffset,
            nodeStartLineNumber: originalLineNumber - (lineNumber - 1 - x.lf_left)
          });
          return buffer.substring(startOffset + prevAccumulatedValue, startOffset + accumulatedValue - endOffset);
        } else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
          const prevAccumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
          const buffer = this._buffers[x.piece.bufferIndex].buffer;
          const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
          ret = buffer.substring(startOffset + prevAccumulatedValue, startOffset + x.piece.length);
          break;
        } else {
          lineNumber -= x.lf_left + x.piece.lineFeedCnt;
          nodeStartOffset += x.size_left + x.piece.length;
          x = x.right;
        }
      }
    }
    x = x.next();
    while (x !== SENTINEL) {
      const buffer = this._buffers[x.piece.bufferIndex].buffer;
      if (x.piece.lineFeedCnt > 0) {
        const accumulatedValue = this.getAccumulatedValue(x, 0);
        const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
        ret += buffer.substring(startOffset, startOffset + accumulatedValue - endOffset);
        return ret;
      } else {
        const startOffset = this.offsetInBuffer(x.piece.bufferIndex, x.piece.start);
        ret += buffer.substr(startOffset, x.piece.length);
      }
      x = x.next();
    }
    return ret;
  }
  computeBufferMetadata() {
    let x = this.root;
    let lfCnt = 1;
    let len = 0;
    while (x !== SENTINEL) {
      lfCnt += x.lf_left + x.piece.lineFeedCnt;
      len += x.size_left + x.piece.length;
      x = x.right;
    }
    this._lineCnt = lfCnt;
    this._length = len;
    this._searchCache.validate(this._length);
  }
  // #region node operations
  getIndexOf(node, accumulatedValue) {
    const piece = node.piece;
    const pos = this.positionInBuffer(node, accumulatedValue);
    const lineCnt = pos.line - piece.start.line;
    if (this.offsetInBuffer(piece.bufferIndex, piece.end) - this.offsetInBuffer(piece.bufferIndex, piece.start) === accumulatedValue) {
      const realLineCnt = this.getLineFeedCnt(node.piece.bufferIndex, piece.start, pos);
      if (realLineCnt !== lineCnt) {
        return { index: realLineCnt, remainder: 0 };
      }
    }
    return { index: lineCnt, remainder: pos.column };
  }
  getAccumulatedValue(node, index) {
    if (index < 0) {
      return 0;
    }
    const piece = node.piece;
    const lineStarts = this._buffers[piece.bufferIndex].lineStarts;
    const expectedLineStartIndex = piece.start.line + index + 1;
    if (expectedLineStartIndex > piece.end.line) {
      return lineStarts[piece.end.line] + piece.end.column - lineStarts[piece.start.line] - piece.start.column;
    } else {
      return lineStarts[expectedLineStartIndex] - lineStarts[piece.start.line] - piece.start.column;
    }
  }
  deleteNodeTail(node, pos) {
    const piece = node.piece;
    const originalLFCnt = piece.lineFeedCnt;
    const originalEndOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
    const newEnd = pos;
    const newEndOffset = this.offsetInBuffer(piece.bufferIndex, newEnd);
    const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, newEnd);
    const lf_delta = newLineFeedCnt - originalLFCnt;
    const size_delta = newEndOffset - originalEndOffset;
    const newLength = piece.length + size_delta;
    node.piece = new Piece(
      piece.bufferIndex,
      piece.start,
      newEnd,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, node, size_delta, lf_delta);
  }
  deleteNodeHead(node, pos) {
    const piece = node.piece;
    const originalLFCnt = piece.lineFeedCnt;
    const originalStartOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
    const newStart = pos;
    const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, newStart, piece.end);
    const newStartOffset = this.offsetInBuffer(piece.bufferIndex, newStart);
    const lf_delta = newLineFeedCnt - originalLFCnt;
    const size_delta = originalStartOffset - newStartOffset;
    const newLength = piece.length + size_delta;
    node.piece = new Piece(
      piece.bufferIndex,
      newStart,
      piece.end,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, node, size_delta, lf_delta);
  }
  shrinkNode(node, start, end) {
    const piece = node.piece;
    const originalStartPos = piece.start;
    const originalEndPos = piece.end;
    const oldLength = piece.length;
    const oldLFCnt = piece.lineFeedCnt;
    const newEnd = start;
    const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, newEnd);
    const newLength = this.offsetInBuffer(piece.bufferIndex, start) - this.offsetInBuffer(piece.bufferIndex, originalStartPos);
    node.piece = new Piece(
      piece.bufferIndex,
      piece.start,
      newEnd,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, node, newLength - oldLength, newLineFeedCnt - oldLFCnt);
    const newPiece = new Piece(
      piece.bufferIndex,
      end,
      originalEndPos,
      this.getLineFeedCnt(piece.bufferIndex, end, originalEndPos),
      this.offsetInBuffer(piece.bufferIndex, originalEndPos) - this.offsetInBuffer(piece.bufferIndex, end)
    );
    const newNode = this.rbInsertRight(node, newPiece);
    this.validateCRLFWithPrevNode(newNode);
  }
  appendToNode(node, value) {
    if (this.adjustCarriageReturnFromNext(value, node)) {
      value += "\n";
    }
    const hitCRLF = this.shouldCheckCRLF() && this.startWithLF(value) && this.endWithCR(node);
    const startOffset = this._buffers[0].buffer.length;
    this._buffers[0].buffer += value;
    const lineStarts = createLineStartsFast(value, false);
    for (let i = 0; i < lineStarts.length; i++) {
      lineStarts[i] += startOffset;
    }
    if (hitCRLF) {
      const prevStartOffset = this._buffers[0].lineStarts[this._buffers[0].lineStarts.length - 2];
      this._buffers[0].lineStarts.pop();
      this._lastChangeBufferPos = { line: this._lastChangeBufferPos.line - 1, column: startOffset - prevStartOffset };
    }
    this._buffers[0].lineStarts = this._buffers[0].lineStarts.concat(lineStarts.slice(1));
    const endIndex = this._buffers[0].lineStarts.length - 1;
    const endColumn = this._buffers[0].buffer.length - this._buffers[0].lineStarts[endIndex];
    const newEnd = { line: endIndex, column: endColumn };
    const newLength = node.piece.length + value.length;
    const oldLineFeedCnt = node.piece.lineFeedCnt;
    const newLineFeedCnt = this.getLineFeedCnt(0, node.piece.start, newEnd);
    const lf_delta = newLineFeedCnt - oldLineFeedCnt;
    node.piece = new Piece(
      node.piece.bufferIndex,
      node.piece.start,
      newEnd,
      newLineFeedCnt,
      newLength
    );
    this._lastChangeBufferPos = newEnd;
    updateTreeMetadata(this, node, value.length, lf_delta);
  }
  nodeAt(offset) {
    let x = this.root;
    const cache = this._searchCache.get(offset);
    if (cache) {
      return {
        node: cache.node,
        nodeStartOffset: cache.nodeStartOffset,
        remainder: offset - cache.nodeStartOffset
      };
    }
    let nodeStartOffset = 0;
    while (x !== SENTINEL) {
      if (x.size_left > offset) {
        x = x.left;
      } else if (x.size_left + x.piece.length >= offset) {
        nodeStartOffset += x.size_left;
        const ret = {
          node: x,
          remainder: offset - x.size_left,
          nodeStartOffset
        };
        this._searchCache.set(ret);
        return ret;
      } else {
        offset -= x.size_left + x.piece.length;
        nodeStartOffset += x.size_left + x.piece.length;
        x = x.right;
      }
    }
    return null;
  }
  nodeAt2(lineNumber, column) {
    let x = this.root;
    let nodeStartOffset = 0;
    while (x !== SENTINEL) {
      if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
        x = x.left;
      } else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
        const prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
        const accumulatedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 1);
        nodeStartOffset += x.size_left;
        return {
          node: x,
          remainder: Math.min(prevAccumualtedValue + column - 1, accumulatedValue),
          nodeStartOffset
        };
      } else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
        const prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
        if (prevAccumualtedValue + column - 1 <= x.piece.length) {
          return {
            node: x,
            remainder: prevAccumualtedValue + column - 1,
            nodeStartOffset
          };
        } else {
          column -= x.piece.length - prevAccumualtedValue;
          break;
        }
      } else {
        lineNumber -= x.lf_left + x.piece.lineFeedCnt;
        nodeStartOffset += x.size_left + x.piece.length;
        x = x.right;
      }
    }
    x = x.next();
    while (x !== SENTINEL) {
      if (x.piece.lineFeedCnt > 0) {
        const accumulatedValue = this.getAccumulatedValue(x, 0);
        const nodeStartOffset2 = this.offsetOfNode(x);
        return {
          node: x,
          remainder: Math.min(column - 1, accumulatedValue),
          nodeStartOffset: nodeStartOffset2
        };
      } else {
        if (x.piece.length >= column - 1) {
          const nodeStartOffset2 = this.offsetOfNode(x);
          return {
            node: x,
            remainder: column - 1,
            nodeStartOffset: nodeStartOffset2
          };
        } else {
          column -= x.piece.length;
        }
      }
      x = x.next();
    }
    return null;
  }
  nodeCharCodeAt(node, offset) {
    if (node.piece.lineFeedCnt < 1) {
      return -1;
    }
    const buffer = this._buffers[node.piece.bufferIndex];
    const newOffset = this.offsetInBuffer(node.piece.bufferIndex, node.piece.start) + offset;
    return buffer.buffer.charCodeAt(newOffset);
  }
  offsetOfNode(node) {
    if (!node) {
      return 0;
    }
    let pos = node.size_left;
    while (node !== this.root) {
      if (node.parent.right === node) {
        pos += node.parent.size_left + node.parent.piece.length;
      }
      node = node.parent;
    }
    return pos;
  }
  // #endregion
  // #region CRLF
  shouldCheckCRLF() {
    return !(this._EOLNormalized && this._EOL === "\n");
  }
  startWithLF(val) {
    if (typeof val === "string") {
      return val.charCodeAt(0) === 10;
    }
    if (val === SENTINEL || val.piece.lineFeedCnt === 0) {
      return false;
    }
    const piece = val.piece;
    const lineStarts = this._buffers[piece.bufferIndex].lineStarts;
    const line = piece.start.line;
    const startOffset = lineStarts[line] + piece.start.column;
    if (line === lineStarts.length - 1) {
      return false;
    }
    const nextLineOffset = lineStarts[line + 1];
    if (nextLineOffset > startOffset + 1) {
      return false;
    }
    return this._buffers[piece.bufferIndex].buffer.charCodeAt(startOffset) === 10;
  }
  endWithCR(val) {
    if (typeof val === "string") {
      return val.charCodeAt(val.length - 1) === 13;
    }
    if (val === SENTINEL || val.piece.lineFeedCnt === 0) {
      return false;
    }
    return this.nodeCharCodeAt(val, val.piece.length - 1) === 13;
  }
  validateCRLFWithPrevNode(nextNode) {
    if (this.shouldCheckCRLF() && this.startWithLF(nextNode)) {
      const node = nextNode.prev();
      if (this.endWithCR(node)) {
        this.fixCRLF(node, nextNode);
      }
    }
  }
  validateCRLFWithNextNode(node) {
    if (this.shouldCheckCRLF() && this.endWithCR(node)) {
      const nextNode = node.next();
      if (this.startWithLF(nextNode)) {
        this.fixCRLF(node, nextNode);
      }
    }
  }
  fixCRLF(prev, next) {
    const nodesToDel = [];
    const lineStarts = this._buffers[prev.piece.bufferIndex].lineStarts;
    let newEnd;
    if (prev.piece.end.column === 0) {
      newEnd = { line: prev.piece.end.line - 1, column: lineStarts[prev.piece.end.line] - lineStarts[prev.piece.end.line - 1] - 1 };
    } else {
      newEnd = { line: prev.piece.end.line, column: prev.piece.end.column - 1 };
    }
    const prevNewLength = prev.piece.length - 1;
    const prevNewLFCnt = prev.piece.lineFeedCnt - 1;
    prev.piece = new Piece(
      prev.piece.bufferIndex,
      prev.piece.start,
      newEnd,
      prevNewLFCnt,
      prevNewLength
    );
    updateTreeMetadata(this, prev, -1, -1);
    if (prev.piece.length === 0) {
      nodesToDel.push(prev);
    }
    const newStart = { line: next.piece.start.line + 1, column: 0 };
    const newLength = next.piece.length - 1;
    const newLineFeedCnt = this.getLineFeedCnt(next.piece.bufferIndex, newStart, next.piece.end);
    next.piece = new Piece(
      next.piece.bufferIndex,
      newStart,
      next.piece.end,
      newLineFeedCnt,
      newLength
    );
    updateTreeMetadata(this, next, -1, -1);
    if (next.piece.length === 0) {
      nodesToDel.push(next);
    }
    const pieces = this.createNewPieces("\r\n");
    this.rbInsertRight(prev, pieces[0]);
    for (let i = 0; i < nodesToDel.length; i++) {
      rbDelete(this, nodesToDel[i]);
    }
  }
  adjustCarriageReturnFromNext(value, node) {
    if (this.shouldCheckCRLF() && this.endWithCR(value)) {
      const nextNode = node.next();
      if (this.startWithLF(nextNode)) {
        value += "\n";
        if (nextNode.piece.length === 1) {
          rbDelete(this, nextNode);
        } else {
          const piece = nextNode.piece;
          const newStart = { line: piece.start.line + 1, column: 0 };
          const newLength = piece.length - 1;
          const newLineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, newStart, piece.end);
          nextNode.piece = new Piece(
            piece.bufferIndex,
            newStart,
            piece.end,
            newLineFeedCnt,
            newLength
          );
          updateTreeMetadata(this, nextNode, -1, -1);
        }
        return true;
      }
    }
    return false;
  }
  // #endregion
  // #endregion
  // #region Tree operations
  iterate(node, callback) {
    if (node === SENTINEL) {
      return callback(SENTINEL);
    }
    const leftRet = this.iterate(node.left, callback);
    if (!leftRet) {
      return leftRet;
    }
    return callback(node) && this.iterate(node.right, callback);
  }
  getNodeContent(node) {
    if (node === SENTINEL) {
      return "";
    }
    const buffer = this._buffers[node.piece.bufferIndex];
    const piece = node.piece;
    const startOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
    const endOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
    const currentContent = buffer.buffer.substring(startOffset, endOffset);
    return currentContent;
  }
  getPieceContent(piece) {
    const buffer = this._buffers[piece.bufferIndex];
    const startOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
    const endOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
    const currentContent = buffer.buffer.substring(startOffset, endOffset);
    return currentContent;
  }
  /**
   *      node              node
   *     /  \              /  \
   *    a   b    <----   a    b
   *                         /
   *                        z
   */
  rbInsertRight(node, p) {
    const z = new TreeNode(p, NodeColor.Red);
    z.left = SENTINEL;
    z.right = SENTINEL;
    z.parent = SENTINEL;
    z.size_left = 0;
    z.lf_left = 0;
    const x = this.root;
    if (x === SENTINEL) {
      this.root = z;
      z.color = NodeColor.Black;
    } else if (node.right === SENTINEL) {
      node.right = z;
      z.parent = node;
    } else {
      const nextNode = leftest(node.right);
      nextNode.left = z;
      z.parent = nextNode;
    }
    fixInsert(this, z);
    return z;
  }
  /**
   *      node              node
   *     /  \              /  \
   *    a   b     ---->   a    b
   *                       \
   *                        z
   */
  rbInsertLeft(node, p) {
    const z = new TreeNode(p, NodeColor.Red);
    z.left = SENTINEL;
    z.right = SENTINEL;
    z.parent = SENTINEL;
    z.size_left = 0;
    z.lf_left = 0;
    if (this.root === SENTINEL) {
      this.root = z;
      z.color = NodeColor.Black;
    } else if (node.left === SENTINEL) {
      node.left = z;
      z.parent = node;
    } else {
      const prevNode = righttest(node.left);
      prevNode.right = z;
      z.parent = prevNode;
    }
    fixInsert(this, z);
    return z;
  }
  getContentOfSubTree(node) {
    let str = "";
    this.iterate(node, (node2) => {
      str += this.getNodeContent(node2);
      return true;
    });
    return str;
  }
  // #endregion
}
export {
  Piece,
  PieceTreeBase,
  StringBuffer,
  createLineStarts,
  createLineStartsFast
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHBpZWNlVHJlZVRleHRCdWZmZXJcXHBpZWNlVHJlZUJhc2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoLCBJVGV4dFNuYXBzaG90LCBTZWFyY2hEYXRhIH0gZnJvbSAnLi4vLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgTm9kZUNvbG9yLCBTRU5USU5FTCwgVHJlZU5vZGUsIGZpeEluc2VydCwgbGVmdGVzdCwgcmJEZWxldGUsIHJpZ2h0dGVzdCwgdXBkYXRlVHJlZU1ldGFkYXRhIH0gZnJvbSAnLi9yYlRyZWVCYXNlLmpzJztcbmltcG9ydCB7IFNlYXJjaGVyLCBjcmVhdGVGaW5kTWF0Y2gsIGlzVmFsaWRNYXRjaCB9IGZyb20gJy4uL3RleHRNb2RlbFNlYXJjaC5qcyc7XG5cbi8vIGNvbnN0IGxmUmVnZXggPSBuZXcgUmVnRXhwKC9cXHJcXG58XFxyfFxcbi9nKTtcbmNvbnN0IEF2ZXJhZ2VCdWZmZXJTaXplID0gNjU1MzU7XG5cbmZ1bmN0aW9uIGNyZWF0ZVVpbnRBcnJheShhcnI6IG51bWJlcltdKTogVWludDMyQXJyYXkgfCBVaW50MTZBcnJheSB7XG5cdGxldCByO1xuXHRpZiAoYXJyW2Fyci5sZW5ndGggLSAxXSA8IDY1NTM2KSB7XG5cdFx0ciA9IG5ldyBVaW50MTZBcnJheShhcnIubGVuZ3RoKTtcblx0fSBlbHNlIHtcblx0XHRyID0gbmV3IFVpbnQzMkFycmF5KGFyci5sZW5ndGgpO1xuXHR9XG5cdHIuc2V0KGFyciwgMCk7XG5cdHJldHVybiByO1xufVxuXG5jbGFzcyBMaW5lU3RhcnRzIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVTdGFydHM6IFVpbnQzMkFycmF5IHwgVWludDE2QXJyYXkgfCBudW1iZXJbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY3I6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGY6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgY3JsZjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBpc0Jhc2ljQVNDSUk6IGJvb2xlYW5cblx0KSB7IH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpbmVTdGFydHNGYXN0KHN0cjogc3RyaW5nLCByZWFkb25seTogYm9vbGVhbiA9IHRydWUpOiBVaW50MzJBcnJheSB8IFVpbnQxNkFycmF5IHwgbnVtYmVyW10ge1xuXHRjb25zdCByOiBudW1iZXJbXSA9IFswXTtcblx0bGV0IHJMZW5ndGggPSAxO1xuXG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzdHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBjaHIgPSBzdHIuY2hhckNvZGVBdChpKTtcblxuXHRcdGlmIChjaHIgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuKSB7XG5cdFx0XHRpZiAoaSArIDEgPCBsZW4gJiYgc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0XHQvLyBcXHJcXG4uLi4gY2FzZVxuXHRcdFx0XHRyW3JMZW5ndGgrK10gPSBpICsgMjtcblx0XHRcdFx0aSsrOyAvLyBza2lwIFxcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gXFxyLi4uIGNhc2Vcblx0XHRcdFx0cltyTGVuZ3RoKytdID0gaSArIDE7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjaHIgPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0XHRyW3JMZW5ndGgrK10gPSBpICsgMTtcblx0XHR9XG5cdH1cblx0aWYgKHJlYWRvbmx5KSB7XG5cdFx0cmV0dXJuIGNyZWF0ZVVpbnRBcnJheShyKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gcjtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTGluZVN0YXJ0cyhyOiBudW1iZXJbXSwgc3RyOiBzdHJpbmcpOiBMaW5lU3RhcnRzIHtcblx0ci5sZW5ndGggPSAwO1xuXHRyWzBdID0gMDtcblx0bGV0IHJMZW5ndGggPSAxO1xuXHRsZXQgY3IgPSAwLCBsZiA9IDAsIGNybGYgPSAwO1xuXHRsZXQgaXNCYXNpY0FTQ0lJID0gdHJ1ZTtcblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHN0ci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGNociA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG5cdFx0aWYgKGNociA9PT0gQ2hhckNvZGUuQ2FycmlhZ2VSZXR1cm4pIHtcblx0XHRcdGlmIChpICsgMSA8IGxlbiAmJiBzdHIuY2hhckNvZGVBdChpICsgMSkgPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0XHRcdC8vIFxcclxcbi4uLiBjYXNlXG5cdFx0XHRcdGNybGYrKztcblx0XHRcdFx0cltyTGVuZ3RoKytdID0gaSArIDI7XG5cdFx0XHRcdGkrKzsgLy8gc2tpcCBcXG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNyKys7XG5cdFx0XHRcdC8vIFxcci4uLiBjYXNlXG5cdFx0XHRcdHJbckxlbmd0aCsrXSA9IGkgKyAxO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY2hyID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0bGYrKztcblx0XHRcdHJbckxlbmd0aCsrXSA9IGkgKyAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaXNCYXNpY0FTQ0lJKSB7XG5cdFx0XHRcdGlmIChjaHIgIT09IENoYXJDb2RlLlRhYiAmJiAoY2hyIDwgMzIgfHwgY2hyID4gMTI2KSkge1xuXHRcdFx0XHRcdGlzQmFzaWNBU0NJSSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBMaW5lU3RhcnRzKGNyZWF0ZVVpbnRBcnJheShyKSwgY3IsIGxmLCBjcmxmLCBpc0Jhc2ljQVNDSUkpO1xuXHRyLmxlbmd0aCA9IDA7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuaW50ZXJmYWNlIE5vZGVQb3NpdGlvbiB7XG5cdC8qKlxuXHQgKiBQaWVjZSBJbmRleFxuXHQgKi9cblx0bm9kZTogVHJlZU5vZGU7XG5cdC8qKlxuXHQgKiByZW1haW5kZXIgaW4gY3VycmVudCBwaWVjZS5cblx0Ki9cblx0cmVtYWluZGVyOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBub2RlIHN0YXJ0IG9mZnNldCBpbiBkb2N1bWVudC5cblx0ICovXG5cdG5vZGVTdGFydE9mZnNldDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQnVmZmVyQ3Vyc29yIHtcblx0LyoqXG5cdCAqIExpbmUgbnVtYmVyIGluIGN1cnJlbnQgYnVmZmVyXG5cdCAqL1xuXHRsaW5lOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb2x1bW4gbnVtYmVyIGluIGN1cnJlbnQgYnVmZmVyXG5cdCAqL1xuXHRjb2x1bW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFBpZWNlIHtcblx0cmVhZG9ubHkgYnVmZmVySW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgc3RhcnQ6IEJ1ZmZlckN1cnNvcjtcblx0cmVhZG9ubHkgZW5kOiBCdWZmZXJDdXJzb3I7XG5cdHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXHRyZWFkb25seSBsaW5lRmVlZENudDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGJ1ZmZlckluZGV4OiBudW1iZXIsIHN0YXJ0OiBCdWZmZXJDdXJzb3IsIGVuZDogQnVmZmVyQ3Vyc29yLCBsaW5lRmVlZENudDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikge1xuXHRcdHRoaXMuYnVmZmVySW5kZXggPSBidWZmZXJJbmRleDtcblx0XHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdFx0dGhpcy5lbmQgPSBlbmQ7XG5cdFx0dGhpcy5saW5lRmVlZENudCA9IGxpbmVGZWVkQ250O1xuXHRcdHRoaXMubGVuZ3RoID0gbGVuZ3RoO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdHJpbmdCdWZmZXIge1xuXHRidWZmZXI6IHN0cmluZztcblx0bGluZVN0YXJ0czogVWludDMyQXJyYXkgfCBVaW50MTZBcnJheSB8IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKGJ1ZmZlcjogc3RyaW5nLCBsaW5lU3RhcnRzOiBVaW50MzJBcnJheSB8IFVpbnQxNkFycmF5IHwgbnVtYmVyW10pIHtcblx0XHR0aGlzLmJ1ZmZlciA9IGJ1ZmZlcjtcblx0XHR0aGlzLmxpbmVTdGFydHMgPSBsaW5lU3RhcnRzO1xuXHR9XG59XG5cbi8qKlxuICogUmVhZG9ubHkgc25hcHNob3QgZm9yIHBpZWNlIHRyZWUuXG4gKiBJbiBhIHJlYWwgbXVsdGlwbGUgdGhyZWFkIGVudmlyb25tZW50LCB0byBtYWtlIHNuYXBzaG90IHJlYWRpbmcgYWx3YXlzIHdvcmsgY29ycmVjdGx5LCB3ZSBuZWVkIHRvXG4gKiAxLiBNYWtlIFRyZWVOb2RlLnBpZWNlIGltbXV0YWJsZSwgdGhlbiByZWFkaW5nIGFuZCB3cml0aW5nIGNhbiBydW4gaW4gcGFyYWxsZWwuXG4gKiAyLiBUcmVlTm9kZS9CdWZmZXJzIG5vcm1hbGl6YXRpb24gc2hvdWxkIG5vdCBoYXBwZW4gZHVyaW5nIHNuYXBzaG90IHJlYWRpbmcuXG4gKi9cbmNsYXNzIFBpZWNlVHJlZVNuYXBzaG90IGltcGxlbWVudHMgSVRleHRTbmFwc2hvdCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BpZWNlczogUGllY2VbXTtcblx0cHJpdmF0ZSBfaW5kZXg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJlZTogUGllY2VUcmVlQmFzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfQk9NOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IodHJlZTogUGllY2VUcmVlQmFzZSwgQk9NOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9waWVjZXMgPSBbXTtcblx0XHR0aGlzLl90cmVlID0gdHJlZTtcblx0XHR0aGlzLl9CT00gPSBCT007XG5cdFx0dGhpcy5faW5kZXggPSAwO1xuXHRcdGlmICh0cmVlLnJvb3QgIT09IFNFTlRJTkVMKSB7XG5cdFx0XHR0cmVlLml0ZXJhdGUodHJlZS5yb290LCBub2RlID0+IHtcblx0XHRcdFx0aWYgKG5vZGUgIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGllY2VzLnB1c2gobm9kZS5waWVjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRyZWFkKCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9waWVjZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5faW5kZXggPT09IDApIHtcblx0XHRcdFx0dGhpcy5faW5kZXgrKztcblx0XHRcdFx0cmV0dXJuIHRoaXMuX0JPTTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pbmRleCA+IHRoaXMuX3BpZWNlcy5sZW5ndGggLSAxKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faW5kZXggPT09IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl9CT00gKyB0aGlzLl90cmVlLmdldFBpZWNlQ29udGVudCh0aGlzLl9waWVjZXNbdGhpcy5faW5kZXgrK10pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5nZXRQaWVjZUNvbnRlbnQodGhpcy5fcGllY2VzW3RoaXMuX2luZGV4KytdKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgQ2FjaGVFbnRyeSB7XG5cdG5vZGU6IFRyZWVOb2RlO1xuXHRub2RlU3RhcnRPZmZzZXQ6IG51bWJlcjtcblx0bm9kZVN0YXJ0TGluZU51bWJlcj86IG51bWJlcjtcbn1cblxuY2xhc3MgUGllY2VUcmVlU2VhcmNoQ2FjaGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW1pdDogbnVtYmVyO1xuXHRwcml2YXRlIF9jYWNoZTogQ2FjaGVFbnRyeVtdO1xuXG5cdGNvbnN0cnVjdG9yKGxpbWl0OiBudW1iZXIpIHtcblx0XHR0aGlzLl9saW1pdCA9IGxpbWl0O1xuXHRcdHRoaXMuX2NhY2hlID0gW107XG5cdH1cblxuXHRwdWJsaWMgZ2V0KG9mZnNldDogbnVtYmVyKTogQ2FjaGVFbnRyeSB8IG51bGwge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9jYWNoZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3Qgbm9kZVBvcyA9IHRoaXMuX2NhY2hlW2ldO1xuXHRcdFx0aWYgKG5vZGVQb3Mubm9kZVN0YXJ0T2Zmc2V0IDw9IG9mZnNldCAmJiBub2RlUG9zLm5vZGVTdGFydE9mZnNldCArIG5vZGVQb3Mubm9kZS5waWVjZS5sZW5ndGggPj0gb2Zmc2V0KSB7XG5cdFx0XHRcdHJldHVybiBub2RlUG9zO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBnZXQyKGxpbmVOdW1iZXI6IG51bWJlcik6IHsgbm9kZTogVHJlZU5vZGU7IG5vZGVTdGFydE9mZnNldDogbnVtYmVyOyBub2RlU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIgfSB8IG51bGwge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9jYWNoZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3Qgbm9kZVBvcyA9IHRoaXMuX2NhY2hlW2ldO1xuXHRcdFx0aWYgKG5vZGVQb3Mubm9kZVN0YXJ0TGluZU51bWJlciAmJiBub2RlUG9zLm5vZGVTdGFydExpbmVOdW1iZXIgPCBsaW5lTnVtYmVyICYmIG5vZGVQb3Mubm9kZVN0YXJ0TGluZU51bWJlciArIG5vZGVQb3Mubm9kZS5waWVjZS5saW5lRmVlZENudCA+PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybiA8eyBub2RlOiBUcmVlTm9kZTsgbm9kZVN0YXJ0T2Zmc2V0OiBudW1iZXI7IG5vZGVTdGFydExpbmVOdW1iZXI6IG51bWJlciB9Pm5vZGVQb3M7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHNldChub2RlUG9zaXRpb246IENhY2hlRW50cnkpIHtcblx0XHRpZiAodGhpcy5fY2FjaGUubGVuZ3RoID49IHRoaXMuX2xpbWl0KSB7XG5cdFx0XHR0aGlzLl9jYWNoZS5zaGlmdCgpO1xuXHRcdH1cblx0XHR0aGlzLl9jYWNoZS5wdXNoKG5vZGVQb3NpdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUob2Zmc2V0OiBudW1iZXIpIHtcblx0XHRsZXQgaGFzSW52YWxpZFZhbCA9IGZhbHNlO1xuXHRcdGNvbnN0IHRtcDogQXJyYXk8Q2FjaGVFbnRyeSB8IG51bGw+ID0gdGhpcy5fY2FjaGU7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0bXAubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG5vZGVQb3MgPSB0bXBbaV0hO1xuXHRcdFx0aWYgKG5vZGVQb3Mubm9kZS5wYXJlbnQgPT09IG51bGwgfHwgbm9kZVBvcy5ub2RlU3RhcnRPZmZzZXQgPj0gb2Zmc2V0KSB7XG5cdFx0XHRcdHRtcFtpXSA9IG51bGw7XG5cdFx0XHRcdGhhc0ludmFsaWRWYWwgPSB0cnVlO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaGFzSW52YWxpZFZhbCkge1xuXHRcdFx0Y29uc3QgbmV3QXJyOiBDYWNoZUVudHJ5W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdG1wKSB7XG5cdFx0XHRcdGlmIChlbnRyeSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdG5ld0Fyci5wdXNoKGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jYWNoZSA9IG5ld0Fycjtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBpZWNlVHJlZUJhc2Uge1xuXHRyb290ITogVHJlZU5vZGU7XG5cdHByb3RlY3RlZCBfYnVmZmVycyE6IFN0cmluZ0J1ZmZlcltdOyAvLyAwIGlzIGNoYW5nZSBidWZmZXIsIG90aGVycyBhcmUgcmVhZG9ubHkgb3JpZ2luYWwgYnVmZmVyLlxuXHRwcm90ZWN0ZWQgX2xpbmVDbnQhOiBudW1iZXI7XG5cdHByb3RlY3RlZCBfbGVuZ3RoITogbnVtYmVyO1xuXHRwcm90ZWN0ZWQgX0VPTCE6ICdcXHJcXG4nIHwgJ1xcbic7XG5cdHByb3RlY3RlZCBfRU9MTGVuZ3RoITogbnVtYmVyO1xuXHRwcm90ZWN0ZWQgX0VPTE5vcm1hbGl6ZWQhOiBib29sZWFuO1xuXHRwcml2YXRlIF9sYXN0Q2hhbmdlQnVmZmVyUG9zITogQnVmZmVyQ3Vyc29yO1xuXHRwcml2YXRlIF9zZWFyY2hDYWNoZSE6IFBpZWNlVHJlZVNlYXJjaENhY2hlO1xuXHRwcml2YXRlIF9sYXN0VmlzaXRlZExpbmUhOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgdmFsdWU6IHN0cmluZyB9O1xuXG5cdGNvbnN0cnVjdG9yKGNodW5rczogU3RyaW5nQnVmZmVyW10sIGVvbDogJ1xcclxcbicgfCAnXFxuJywgZW9sTm9ybWFsaXplZDogYm9vbGVhbikge1xuXHRcdHRoaXMuY3JlYXRlKGNodW5rcywgZW9sLCBlb2xOb3JtYWxpemVkKTtcblx0fVxuXG5cdGNyZWF0ZShjaHVua3M6IFN0cmluZ0J1ZmZlcltdLCBlb2w6ICdcXHJcXG4nIHwgJ1xcbicsIGVvbE5vcm1hbGl6ZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9idWZmZXJzID0gW1xuXHRcdFx0bmV3IFN0cmluZ0J1ZmZlcignJywgWzBdKVxuXHRcdF07XG5cdFx0dGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcyA9IHsgbGluZTogMCwgY29sdW1uOiAwIH07XG5cdFx0dGhpcy5yb290ID0gU0VOVElORUw7XG5cdFx0dGhpcy5fbGluZUNudCA9IDE7XG5cdFx0dGhpcy5fbGVuZ3RoID0gMDtcblx0XHR0aGlzLl9FT0wgPSBlb2w7XG5cdFx0dGhpcy5fRU9MTGVuZ3RoID0gZW9sLmxlbmd0aDtcblx0XHR0aGlzLl9FT0xOb3JtYWxpemVkID0gZW9sTm9ybWFsaXplZDtcblxuXHRcdGxldCBsYXN0Tm9kZTogVHJlZU5vZGUgfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY2h1bmtzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoY2h1bmtzW2ldLmJ1ZmZlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGlmICghY2h1bmtzW2ldLmxpbmVTdGFydHMpIHtcblx0XHRcdFx0XHRjaHVua3NbaV0ubGluZVN0YXJ0cyA9IGNyZWF0ZUxpbmVTdGFydHNGYXN0KGNodW5rc1tpXS5idWZmZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRcdFx0aSArIDEsXG5cdFx0XHRcdFx0eyBsaW5lOiAwLCBjb2x1bW46IDAgfSxcblx0XHRcdFx0XHR7IGxpbmU6IGNodW5rc1tpXS5saW5lU3RhcnRzLmxlbmd0aCAtIDEsIGNvbHVtbjogY2h1bmtzW2ldLmJ1ZmZlci5sZW5ndGggLSBjaHVua3NbaV0ubGluZVN0YXJ0c1tjaHVua3NbaV0ubGluZVN0YXJ0cy5sZW5ndGggLSAxXSB9LFxuXHRcdFx0XHRcdGNodW5rc1tpXS5saW5lU3RhcnRzLmxlbmd0aCAtIDEsXG5cdFx0XHRcdFx0Y2h1bmtzW2ldLmJ1ZmZlci5sZW5ndGhcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5fYnVmZmVycy5wdXNoKGNodW5rc1tpXSk7XG5cdFx0XHRcdGxhc3ROb2RlID0gdGhpcy5yYkluc2VydFJpZ2h0KGxhc3ROb2RlLCBwaWVjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VhcmNoQ2FjaGUgPSBuZXcgUGllY2VUcmVlU2VhcmNoQ2FjaGUoMSk7XG5cdFx0dGhpcy5fbGFzdFZpc2l0ZWRMaW5lID0geyBsaW5lTnVtYmVyOiAwLCB2YWx1ZTogJycgfTtcblx0XHR0aGlzLmNvbXB1dGVCdWZmZXJNZXRhZGF0YSgpO1xuXHR9XG5cblx0bm9ybWFsaXplRU9MKGVvbDogJ1xcclxcbicgfCAnXFxuJykge1xuXHRcdGNvbnN0IGF2ZXJhZ2VCdWZmZXJTaXplID0gQXZlcmFnZUJ1ZmZlclNpemU7XG5cdFx0Y29uc3QgbWluID0gYXZlcmFnZUJ1ZmZlclNpemUgLSBNYXRoLmZsb29yKGF2ZXJhZ2VCdWZmZXJTaXplIC8gMyk7XG5cdFx0Y29uc3QgbWF4ID0gbWluICogMjtcblxuXHRcdGxldCB0ZW1wQ2h1bmsgPSAnJztcblx0XHRsZXQgdGVtcENodW5rTGVuID0gMDtcblx0XHRjb25zdCBjaHVua3M6IFN0cmluZ0J1ZmZlcltdID0gW107XG5cblx0XHR0aGlzLml0ZXJhdGUodGhpcy5yb290LCBub2RlID0+IHtcblx0XHRcdGNvbnN0IHN0ciA9IHRoaXMuZ2V0Tm9kZUNvbnRlbnQobm9kZSk7XG5cdFx0XHRjb25zdCBsZW4gPSBzdHIubGVuZ3RoO1xuXHRcdFx0aWYgKHRlbXBDaHVua0xlbiA8PSBtaW4gfHwgdGVtcENodW5rTGVuICsgbGVuIDwgbWF4KSB7XG5cdFx0XHRcdHRlbXBDaHVuayArPSBzdHI7XG5cdFx0XHRcdHRlbXBDaHVua0xlbiArPSBsZW47XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmbHVzaCBhbnl3YXlzXG5cdFx0XHRjb25zdCB0ZXh0ID0gdGVtcENodW5rLnJlcGxhY2UoL1xcclxcbnxcXHJ8XFxuL2csIGVvbCk7XG5cdFx0XHRjaHVua3MucHVzaChuZXcgU3RyaW5nQnVmZmVyKHRleHQsIGNyZWF0ZUxpbmVTdGFydHNGYXN0KHRleHQpKSk7XG5cdFx0XHR0ZW1wQ2h1bmsgPSBzdHI7XG5cdFx0XHR0ZW1wQ2h1bmtMZW4gPSBsZW47XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGlmICh0ZW1wQ2h1bmtMZW4gPiAwKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gdGVtcENodW5rLnJlcGxhY2UoL1xcclxcbnxcXHJ8XFxuL2csIGVvbCk7XG5cdFx0XHRjaHVua3MucHVzaChuZXcgU3RyaW5nQnVmZmVyKHRleHQsIGNyZWF0ZUxpbmVTdGFydHNGYXN0KHRleHQpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jcmVhdGUoY2h1bmtzLCBlb2wsIHRydWUpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBCdWZmZXIgQVBJXG5cdHB1YmxpYyBnZXRFT0woKTogJ1xcclxcbicgfCAnXFxuJyB7XG5cdFx0cmV0dXJuIHRoaXMuX0VPTDtcblx0fVxuXG5cdHB1YmxpYyBzZXRFT0wobmV3RU9MOiAnXFxyXFxuJyB8ICdcXG4nKTogdm9pZCB7XG5cdFx0dGhpcy5fRU9MID0gbmV3RU9MO1xuXHRcdHRoaXMuX0VPTExlbmd0aCA9IHRoaXMuX0VPTC5sZW5ndGg7XG5cdFx0dGhpcy5ub3JtYWxpemVFT0wobmV3RU9MKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVTbmFwc2hvdChCT006IHN0cmluZyk6IElUZXh0U25hcHNob3Qge1xuXHRcdHJldHVybiBuZXcgUGllY2VUcmVlU25hcHNob3QodGhpcywgQk9NKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbChvdGhlcjogUGllY2VUcmVlQmFzZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmdldExlbmd0aCgpICE9PSBvdGhlci5nZXRMZW5ndGgoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5nZXRMaW5lQ291bnQoKSAhPT0gb3RoZXIuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRjb25zdCByZXQgPSB0aGlzLml0ZXJhdGUodGhpcy5yb290LCBub2RlID0+IHtcblx0XHRcdGlmIChub2RlID09PSBTRU5USU5FTCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0ciA9IHRoaXMuZ2V0Tm9kZUNvbnRlbnQobm9kZSk7XG5cdFx0XHRjb25zdCBsZW4gPSBzdHIubGVuZ3RoO1xuXHRcdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IG90aGVyLm5vZGVBdChvZmZzZXQpO1xuXHRcdFx0Y29uc3QgZW5kUG9zaXRpb24gPSBvdGhlci5ub2RlQXQob2Zmc2V0ICsgbGVuKTtcblx0XHRcdGNvbnN0IHZhbCA9IG90aGVyLmdldFZhbHVlSW5SYW5nZTIoc3RhcnRQb3NpdGlvbiwgZW5kUG9zaXRpb24pO1xuXG5cdFx0XHRvZmZzZXQgKz0gbGVuO1xuXHRcdFx0cmV0dXJuIHN0ciA9PT0gdmFsO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHB1YmxpYyBnZXRPZmZzZXRBdChsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgbGVmdExlbiA9IDA7IC8vIGlub3JkZXJcblxuXHRcdGxldCB4ID0gdGhpcy5yb290O1xuXG5cdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRpZiAoeC5sZWZ0ICE9PSBTRU5USU5FTCAmJiB4LmxmX2xlZnQgKyAxID49IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0eCA9IHgubGVmdDtcblx0XHRcdH0gZWxzZSBpZiAoeC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudCArIDEgPj0gbGluZU51bWJlcikge1xuXHRcdFx0XHRsZWZ0TGVuICs9IHguc2l6ZV9sZWZ0O1xuXHRcdFx0XHQvLyBsaW5lTnVtYmVyID49IDJcblx0XHRcdFx0Y29uc3QgYWNjdW11YWx0ZWRWYWxJbkN1cnJlbnRJbmRleCA9IHRoaXMuZ2V0QWNjdW11bGF0ZWRWYWx1ZSh4LCBsaW5lTnVtYmVyIC0geC5sZl9sZWZ0IC0gMik7XG5cdFx0XHRcdHJldHVybiBsZWZ0TGVuICs9IGFjY3VtdWFsdGVkVmFsSW5DdXJyZW50SW5kZXggKyBjb2x1bW4gLSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGluZU51bWJlciAtPSB4LmxmX2xlZnQgKyB4LnBpZWNlLmxpbmVGZWVkQ250O1xuXHRcdFx0XHRsZWZ0TGVuICs9IHguc2l6ZV9sZWZ0ICsgeC5waWVjZS5sZW5ndGg7XG5cdFx0XHRcdHggPSB4LnJpZ2h0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsZWZ0TGVuO1xuXHR9XG5cblx0cHVibGljIGdldFBvc2l0aW9uQXQob2Zmc2V0OiBudW1iZXIpOiBQb3NpdGlvbiB7XG5cdFx0b2Zmc2V0ID0gTWF0aC5mbG9vcihvZmZzZXQpO1xuXHRcdG9mZnNldCA9IE1hdGgubWF4KDAsIG9mZnNldCk7XG5cblx0XHRsZXQgeCA9IHRoaXMucm9vdDtcblx0XHRsZXQgbGZDbnQgPSAwO1xuXHRcdGNvbnN0IG9yaWdpbmFsT2Zmc2V0ID0gb2Zmc2V0O1xuXG5cdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRpZiAoeC5zaXplX2xlZnQgIT09IDAgJiYgeC5zaXplX2xlZnQgPj0gb2Zmc2V0KSB7XG5cdFx0XHRcdHggPSB4LmxlZnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHguc2l6ZV9sZWZ0ICsgeC5waWVjZS5sZW5ndGggPj0gb2Zmc2V0KSB7XG5cdFx0XHRcdGNvbnN0IG91dCA9IHRoaXMuZ2V0SW5kZXhPZih4LCBvZmZzZXQgLSB4LnNpemVfbGVmdCk7XG5cblx0XHRcdFx0bGZDbnQgKz0geC5sZl9sZWZ0ICsgb3V0LmluZGV4O1xuXG5cdFx0XHRcdGlmIChvdXQuaW5kZXggPT09IDApIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lU3RhcnRPZmZzZXQgPSB0aGlzLmdldE9mZnNldEF0KGxmQ250ICsgMSwgMSk7XG5cdFx0XHRcdFx0Y29uc3QgY29sdW1uID0gb3JpZ2luYWxPZmZzZXQgLSBsaW5lU3RhcnRPZmZzZXQ7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsZkNudCArIDEsIGNvbHVtbiArIDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsZkNudCArIDEsIG91dC5yZW1haW5kZXIgKyAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9mZnNldCAtPSB4LnNpemVfbGVmdCArIHgucGllY2UubGVuZ3RoO1xuXHRcdFx0XHRsZkNudCArPSB4LmxmX2xlZnQgKyB4LnBpZWNlLmxpbmVGZWVkQ250O1xuXG5cdFx0XHRcdGlmICh4LnJpZ2h0ID09PSBTRU5USU5FTCkge1xuXHRcdFx0XHRcdC8vIGxhc3Qgbm9kZVxuXHRcdFx0XHRcdGNvbnN0IGxpbmVTdGFydE9mZnNldCA9IHRoaXMuZ2V0T2Zmc2V0QXQobGZDbnQgKyAxLCAxKTtcblx0XHRcdFx0XHRjb25zdCBjb2x1bW4gPSBvcmlnaW5hbE9mZnNldCAtIG9mZnNldCAtIGxpbmVTdGFydE9mZnNldDtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxmQ250ICsgMSwgY29sdW1uICsgMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0eCA9IHgucmlnaHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKDEsIDEpO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlSW5SYW5nZShyYW5nZTogUmFuZ2UsIGVvbD86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlciAmJiByYW5nZS5zdGFydENvbHVtbiA9PT0gcmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IHRoaXMubm9kZUF0MihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IHRoaXMubm9kZUF0MihyYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmdldFZhbHVlSW5SYW5nZTIoc3RhcnRQb3NpdGlvbiwgZW5kUG9zaXRpb24pO1xuXHRcdGlmIChlb2wpIHtcblx0XHRcdGlmIChlb2wgIT09IHRoaXMuX0VPTCB8fCAhdGhpcy5fRU9MTm9ybWFsaXplZCkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxyXFxufFxccnxcXG4vZywgZW9sKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVvbCA9PT0gdGhpcy5nZXRFT0woKSAmJiB0aGlzLl9FT0xOb3JtYWxpemVkKSB7XG5cdFx0XHRcdGlmIChlb2wgPT09ICdcXHJcXG4nKSB7XG5cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxyXFxufFxccnxcXG4vZywgZW9sKTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlSW5SYW5nZTIoc3RhcnRQb3NpdGlvbjogTm9kZVBvc2l0aW9uLCBlbmRQb3NpdGlvbjogTm9kZVBvc2l0aW9uKTogc3RyaW5nIHtcblx0XHRpZiAoc3RhcnRQb3NpdGlvbi5ub2RlID09PSBlbmRQb3NpdGlvbi5ub2RlKSB7XG5cdFx0XHRjb25zdCBub2RlID0gc3RhcnRQb3NpdGlvbi5ub2RlO1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1tub2RlLnBpZWNlLmJ1ZmZlckluZGV4XS5idWZmZXI7XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIobm9kZS5waWVjZS5idWZmZXJJbmRleCwgbm9kZS5waWVjZS5zdGFydCk7XG5cdFx0XHRyZXR1cm4gYnVmZmVyLnN1YnN0cmluZyhzdGFydE9mZnNldCArIHN0YXJ0UG9zaXRpb24ucmVtYWluZGVyLCBzdGFydE9mZnNldCArIGVuZFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cdFx0fVxuXG5cdFx0bGV0IHggPSBzdGFydFBvc2l0aW9uLm5vZGU7XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1t4LnBpZWNlLmJ1ZmZlckluZGV4XS5idWZmZXI7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKHgucGllY2UuYnVmZmVySW5kZXgsIHgucGllY2Uuc3RhcnQpO1xuXHRcdGxldCByZXQgPSBidWZmZXIuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0ICsgc3RhcnRQb3NpdGlvbi5yZW1haW5kZXIsIHN0YXJ0T2Zmc2V0ICsgeC5waWVjZS5sZW5ndGgpO1xuXG5cdFx0eCA9IHgubmV4dCgpO1xuXHRcdHdoaWxlICh4ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1t4LnBpZWNlLmJ1ZmZlckluZGV4XS5idWZmZXI7XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIoeC5waWVjZS5idWZmZXJJbmRleCwgeC5waWVjZS5zdGFydCk7XG5cblx0XHRcdGlmICh4ID09PSBlbmRQb3NpdGlvbi5ub2RlKSB7XG5cdFx0XHRcdHJldCArPSBidWZmZXIuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBzdGFydE9mZnNldCArIGVuZFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0ICs9IGJ1ZmZlci5zdWJzdHIoc3RhcnRPZmZzZXQsIHgucGllY2UubGVuZ3RoKTtcblx0XHRcdH1cblxuXHRcdFx0eCA9IHgubmV4dCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZXNDb250ZW50KCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgbGluZXNMZW5ndGggPSAwO1xuXHRcdGxldCBjdXJyZW50TGluZSA9ICcnO1xuXHRcdGxldCBkYW5nbGluZ0NSID0gZmFsc2U7XG5cblx0XHR0aGlzLml0ZXJhdGUodGhpcy5yb290LCBub2RlID0+IHtcblx0XHRcdGlmIChub2RlID09PSBTRU5USU5FTCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGllY2UgPSBub2RlLnBpZWNlO1xuXHRcdFx0bGV0IHBpZWNlTGVuZ3RoID0gcGllY2UubGVuZ3RoO1xuXHRcdFx0aWYgKHBpZWNlTGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW3BpZWNlLmJ1ZmZlckluZGV4XS5idWZmZXI7XG5cdFx0XHRjb25zdCBsaW5lU3RhcnRzID0gdGhpcy5fYnVmZmVyc1twaWVjZS5idWZmZXJJbmRleF0ubGluZVN0YXJ0cztcblxuXHRcdFx0Y29uc3QgcGllY2VTdGFydExpbmUgPSBwaWVjZS5zdGFydC5saW5lO1xuXHRcdFx0Y29uc3QgcGllY2VFbmRMaW5lID0gcGllY2UuZW5kLmxpbmU7XG5cdFx0XHRsZXQgcGllY2VTdGFydE9mZnNldCA9IGxpbmVTdGFydHNbcGllY2VTdGFydExpbmVdICsgcGllY2Uuc3RhcnQuY29sdW1uO1xuXG5cdFx0XHRpZiAoZGFuZ2xpbmdDUikge1xuXHRcdFx0XHRpZiAoYnVmZmVyLmNoYXJDb2RlQXQocGllY2VTdGFydE9mZnNldCkgPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0XHRcdFx0Ly8gcHJldGVuZCB0aGUgXFxuIHdhcyBpbiB0aGUgcHJldmlvdXMgcGllY2UuLlxuXHRcdFx0XHRcdHBpZWNlU3RhcnRPZmZzZXQrKztcblx0XHRcdFx0XHRwaWVjZUxlbmd0aC0tO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxpbmVzW2xpbmVzTGVuZ3RoKytdID0gY3VycmVudExpbmU7XG5cdFx0XHRcdGN1cnJlbnRMaW5lID0gJyc7XG5cdFx0XHRcdGRhbmdsaW5nQ1IgPSBmYWxzZTtcblx0XHRcdFx0aWYgKHBpZWNlTGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHBpZWNlU3RhcnRMaW5lID09PSBwaWVjZUVuZExpbmUpIHtcblx0XHRcdFx0Ly8gdGhpcyBwaWVjZSBoYXMgbm8gbmV3IGxpbmVzXG5cdFx0XHRcdGlmICghdGhpcy5fRU9MTm9ybWFsaXplZCAmJiBidWZmZXIuY2hhckNvZGVBdChwaWVjZVN0YXJ0T2Zmc2V0ICsgcGllY2VMZW5ndGggLSAxKSA9PT0gQ2hhckNvZGUuQ2FycmlhZ2VSZXR1cm4pIHtcblx0XHRcdFx0XHRkYW5nbGluZ0NSID0gdHJ1ZTtcblx0XHRcdFx0XHRjdXJyZW50TGluZSArPSBidWZmZXIuc3Vic3RyKHBpZWNlU3RhcnRPZmZzZXQsIHBpZWNlTGVuZ3RoIC0gMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3VycmVudExpbmUgKz0gYnVmZmVyLnN1YnN0cihwaWVjZVN0YXJ0T2Zmc2V0LCBwaWVjZUxlbmd0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFkZCB0aGUgdGV4dCBiZWZvcmUgdGhlIGZpcnN0IGxpbmUgc3RhcnQgaW4gdGhpcyBwaWVjZVxuXHRcdFx0Y3VycmVudExpbmUgKz0gKFxuXHRcdFx0XHR0aGlzLl9FT0xOb3JtYWxpemVkXG5cdFx0XHRcdFx0PyBidWZmZXIuc3Vic3RyaW5nKHBpZWNlU3RhcnRPZmZzZXQsIE1hdGgubWF4KHBpZWNlU3RhcnRPZmZzZXQsIGxpbmVTdGFydHNbcGllY2VTdGFydExpbmUgKyAxXSAtIHRoaXMuX0VPTExlbmd0aCkpXG5cdFx0XHRcdFx0OiBidWZmZXIuc3Vic3RyaW5nKHBpZWNlU3RhcnRPZmZzZXQsIGxpbmVTdGFydHNbcGllY2VTdGFydExpbmUgKyAxXSkucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKSQvLCAnJylcblx0XHRcdCk7XG5cdFx0XHRsaW5lc1tsaW5lc0xlbmd0aCsrXSA9IGN1cnJlbnRMaW5lO1xuXG5cdFx0XHRmb3IgKGxldCBsaW5lID0gcGllY2VTdGFydExpbmUgKyAxOyBsaW5lIDwgcGllY2VFbmRMaW5lOyBsaW5lKyspIHtcblx0XHRcdFx0Y3VycmVudExpbmUgPSAoXG5cdFx0XHRcdFx0dGhpcy5fRU9MTm9ybWFsaXplZFxuXHRcdFx0XHRcdFx0PyBidWZmZXIuc3Vic3RyaW5nKGxpbmVTdGFydHNbbGluZV0sIGxpbmVTdGFydHNbbGluZSArIDFdIC0gdGhpcy5fRU9MTGVuZ3RoKVxuXHRcdFx0XHRcdFx0OiBidWZmZXIuc3Vic3RyaW5nKGxpbmVTdGFydHNbbGluZV0sIGxpbmVTdGFydHNbbGluZSArIDFdKS5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pJC8sICcnKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRsaW5lc1tsaW5lc0xlbmd0aCsrXSA9IGN1cnJlbnRMaW5lO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX0VPTE5vcm1hbGl6ZWQgJiYgYnVmZmVyLmNoYXJDb2RlQXQobGluZVN0YXJ0c1twaWVjZUVuZExpbmVdICsgcGllY2UuZW5kLmNvbHVtbiAtIDEpID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybikge1xuXHRcdFx0XHRkYW5nbGluZ0NSID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHBpZWNlLmVuZC5jb2x1bW4gPT09IDApIHtcblx0XHRcdFx0XHQvLyBUaGUgbGFzdCBsaW5lIGVuZGVkIHdpdGggYSBcXHIsIGxldCdzIHVuZG8gdGhlIHB1c2gsIGl0IHdpbGwgYmUgcHVzaGVkIGJ5IG5leHQgaXRlcmF0aW9uXG5cdFx0XHRcdFx0bGluZXNMZW5ndGgtLTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJyZW50TGluZSA9IGJ1ZmZlci5zdWJzdHIobGluZVN0YXJ0c1twaWVjZUVuZExpbmVdLCBwaWVjZS5lbmQuY29sdW1uIC0gMSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnJlbnRMaW5lID0gYnVmZmVyLnN1YnN0cihsaW5lU3RhcnRzW3BpZWNlRW5kTGluZV0sIHBpZWNlLmVuZC5jb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGlmIChkYW5nbGluZ0NSKSB7XG5cdFx0XHRsaW5lc1tsaW5lc0xlbmd0aCsrXSA9IGN1cnJlbnRMaW5lO1xuXHRcdFx0Y3VycmVudExpbmUgPSAnJztcblx0XHR9XG5cblx0XHRsaW5lc1tsaW5lc0xlbmd0aCsrXSA9IGN1cnJlbnRMaW5lO1xuXHRcdHJldHVybiBsaW5lcztcblx0fVxuXG5cdHB1YmxpYyBnZXRMZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lQ250O1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX2xhc3RWaXNpdGVkTGluZS5saW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGFzdFZpc2l0ZWRMaW5lLnZhbHVlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RWaXNpdGVkTGluZS5saW5lTnVtYmVyID0gbGluZU51bWJlcjtcblxuXHRcdGlmIChsaW5lTnVtYmVyID09PSB0aGlzLl9saW5lQ250KSB7XG5cdFx0XHR0aGlzLl9sYXN0VmlzaXRlZExpbmUudmFsdWUgPSB0aGlzLmdldExpbmVSYXdDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fRU9MTm9ybWFsaXplZCkge1xuXHRcdFx0dGhpcy5fbGFzdFZpc2l0ZWRMaW5lLnZhbHVlID0gdGhpcy5nZXRMaW5lUmF3Q29udGVudChsaW5lTnVtYmVyLCB0aGlzLl9FT0xMZW5ndGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sYXN0VmlzaXRlZExpbmUudmFsdWUgPSB0aGlzLmdldExpbmVSYXdDb250ZW50KGxpbmVOdW1iZXIpLnJlcGxhY2UoLyhcXHJcXG58XFxyfFxcbikkLywgJycpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9sYXN0VmlzaXRlZExpbmUudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGFyQ29kZShub2RlUG9zOiBOb2RlUG9zaXRpb24pOiBudW1iZXIge1xuXHRcdGlmIChub2RlUG9zLnJlbWFpbmRlciA9PT0gbm9kZVBvcy5ub2RlLnBpZWNlLmxlbmd0aCkge1xuXHRcdFx0Ly8gdGhlIGNoYXIgd2Ugd2FudCB0byBmZXRjaCBpcyBhdCB0aGUgaGVhZCBvZiBuZXh0IG5vZGUuXG5cdFx0XHRjb25zdCBtYXRjaGluZ05vZGUgPSBub2RlUG9zLm5vZGUubmV4dCgpO1xuXHRcdFx0aWYgKCFtYXRjaGluZ05vZGUpIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbbWF0Y2hpbmdOb2RlLnBpZWNlLmJ1ZmZlckluZGV4XTtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihtYXRjaGluZ05vZGUucGllY2UuYnVmZmVySW5kZXgsIG1hdGNoaW5nTm9kZS5waWVjZS5zdGFydCk7XG5cdFx0XHRyZXR1cm4gYnVmZmVyLmJ1ZmZlci5jaGFyQ29kZUF0KHN0YXJ0T2Zmc2V0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1tub2RlUG9zLm5vZGUucGllY2UuYnVmZmVySW5kZXhdO1xuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKG5vZGVQb3Mubm9kZS5waWVjZS5idWZmZXJJbmRleCwgbm9kZVBvcy5ub2RlLnBpZWNlLnN0YXJ0KTtcblx0XHRcdGNvbnN0IHRhcmdldE9mZnNldCA9IHN0YXJ0T2Zmc2V0ICsgbm9kZVBvcy5yZW1haW5kZXI7XG5cblx0XHRcdHJldHVybiBidWZmZXIuYnVmZmVyLmNoYXJDb2RlQXQodGFyZ2V0T2Zmc2V0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNoYXJDb2RlKGxpbmVOdW1iZXI6IG51bWJlciwgaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3Qgbm9kZVBvcyA9IHRoaXMubm9kZUF0MihsaW5lTnVtYmVyLCBpbmRleCArIDEpO1xuXHRcdHJldHVybiB0aGlzLl9nZXRDaGFyQ29kZShub2RlUG9zKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IHRoaXMuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5nZXRPZmZzZXRBdChsaW5lTnVtYmVyLCAxKTtcblx0XHRcdHJldHVybiB0aGlzLmdldExlbmd0aCgpIC0gc3RhcnRPZmZzZXQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldE9mZnNldEF0KGxpbmVOdW1iZXIgKyAxLCAxKSAtIHRoaXMuZ2V0T2Zmc2V0QXQobGluZU51bWJlciwgMSkgLSB0aGlzLl9FT0xMZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2hhckNvZGUob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IG5vZGVQb3MgPSB0aGlzLm5vZGVBdChvZmZzZXQpO1xuXHRcdHJldHVybiB0aGlzLl9nZXRDaGFyQ29kZShub2RlUG9zKTtcblx0fVxuXG5cdHB1YmxpYyBnZXROZWFyZXN0Q2h1bmsob2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5vZGVQb3MgPSB0aGlzLm5vZGVBdChvZmZzZXQpO1xuXHRcdGlmIChub2RlUG9zLnJlbWFpbmRlciA9PT0gbm9kZVBvcy5ub2RlLnBpZWNlLmxlbmd0aCkge1xuXHRcdFx0Ly8gdGhlIG9mZnNldCBpcyBhdCB0aGUgaGVhZCBvZiBuZXh0IG5vZGUuXG5cdFx0XHRjb25zdCBtYXRjaGluZ05vZGUgPSBub2RlUG9zLm5vZGUubmV4dCgpO1xuXHRcdFx0aWYgKCFtYXRjaGluZ05vZGUgfHwgbWF0Y2hpbmdOb2RlID09PSBTRU5USU5FTCkge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbbWF0Y2hpbmdOb2RlLnBpZWNlLmJ1ZmZlckluZGV4XTtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihtYXRjaGluZ05vZGUucGllY2UuYnVmZmVySW5kZXgsIG1hdGNoaW5nTm9kZS5waWVjZS5zdGFydCk7XG5cdFx0XHRyZXR1cm4gYnVmZmVyLmJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIHN0YXJ0T2Zmc2V0ICsgbWF0Y2hpbmdOb2RlLnBpZWNlLmxlbmd0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbbm9kZVBvcy5ub2RlLnBpZWNlLmJ1ZmZlckluZGV4XTtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihub2RlUG9zLm5vZGUucGllY2UuYnVmZmVySW5kZXgsIG5vZGVQb3Mubm9kZS5waWVjZS5zdGFydCk7XG5cdFx0XHRjb25zdCB0YXJnZXRPZmZzZXQgPSBzdGFydE9mZnNldCArIG5vZGVQb3MucmVtYWluZGVyO1xuXHRcdFx0Y29uc3QgdGFyZ2V0RW5kID0gc3RhcnRPZmZzZXQgKyBub2RlUG9zLm5vZGUucGllY2UubGVuZ3RoO1xuXHRcdFx0cmV0dXJuIGJ1ZmZlci5idWZmZXIuc3Vic3RyaW5nKHRhcmdldE9mZnNldCwgdGFyZ2V0RW5kKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZmluZE1hdGNoZXNJbk5vZGUobm9kZTogVHJlZU5vZGUsIHNlYXJjaGVyOiBTZWFyY2hlciwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIHN0YXJ0Q3Vyc29yOiBCdWZmZXJDdXJzb3IsIGVuZEN1cnNvcjogQnVmZmVyQ3Vyc29yLCBzZWFyY2hEYXRhOiBTZWFyY2hEYXRhLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbiwgbGltaXRSZXN1bHRDb3VudDogbnVtYmVyLCByZXN1bHRMZW46IG51bWJlciwgcmVzdWx0OiBGaW5kTWF0Y2hbXSkge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbbm9kZS5waWVjZS5idWZmZXJJbmRleF07XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXRJbkJ1ZmZlciA9IHRoaXMub2Zmc2V0SW5CdWZmZXIobm9kZS5waWVjZS5idWZmZXJJbmRleCwgbm9kZS5waWVjZS5zdGFydCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLm9mZnNldEluQnVmZmVyKG5vZGUucGllY2UuYnVmZmVySW5kZXgsIHN0YXJ0Q3Vyc29yKTtcblx0XHRjb25zdCBlbmQgPSB0aGlzLm9mZnNldEluQnVmZmVyKG5vZGUucGllY2UuYnVmZmVySW5kZXgsIGVuZEN1cnNvcik7XG5cblx0XHRsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHQvLyBSZXNldCByZWdleCB0byBzZWFyY2ggZnJvbSB0aGUgYmVnaW5uaW5nXG5cdFx0Y29uc3QgcmV0OiBCdWZmZXJDdXJzb3IgPSB7IGxpbmU6IDAsIGNvbHVtbjogMCB9O1xuXHRcdGxldCBzZWFyY2hUZXh0OiBzdHJpbmc7XG5cdFx0bGV0IG9mZnNldEluQnVmZmVyOiAob2Zmc2V0OiBudW1iZXIpID0+IG51bWJlcjtcblxuXHRcdGlmIChzZWFyY2hlci5fd29yZFNlcGFyYXRvcnMpIHtcblx0XHRcdHNlYXJjaFRleHQgPSBidWZmZXIuYnVmZmVyLnN1YnN0cmluZyhzdGFydCwgZW5kKTtcblx0XHRcdG9mZnNldEluQnVmZmVyID0gKG9mZnNldDogbnVtYmVyKSA9PiBvZmZzZXQgKyBzdGFydDtcblx0XHRcdHNlYXJjaGVyLnJlc2V0KDApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZWFyY2hUZXh0ID0gYnVmZmVyLmJ1ZmZlcjtcblx0XHRcdG9mZnNldEluQnVmZmVyID0gKG9mZnNldDogbnVtYmVyKSA9PiBvZmZzZXQ7XG5cdFx0XHRzZWFyY2hlci5yZXNldChzdGFydCk7XG5cdFx0fVxuXG5cdFx0ZG8ge1xuXHRcdFx0bSA9IHNlYXJjaGVyLm5leHQoc2VhcmNoVGV4dCk7XG5cblx0XHRcdGlmIChtKSB7XG5cdFx0XHRcdGlmIChvZmZzZXRJbkJ1ZmZlcihtLmluZGV4KSA+PSBlbmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucG9zaXRpb25JbkJ1ZmZlcihub2RlLCBvZmZzZXRJbkJ1ZmZlcihtLmluZGV4KSAtIHN0YXJ0T2Zmc2V0SW5CdWZmZXIsIHJldCk7XG5cdFx0XHRcdGNvbnN0IGxpbmVGZWVkQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChub2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBzdGFydEN1cnNvciwgcmV0KTtcblx0XHRcdFx0Y29uc3QgcmV0U3RhcnRDb2x1bW4gPSByZXQubGluZSA9PT0gc3RhcnRDdXJzb3IubGluZSA/IHJldC5jb2x1bW4gLSBzdGFydEN1cnNvci5jb2x1bW4gKyBzdGFydENvbHVtbiA6IHJldC5jb2x1bW4gKyAxO1xuXHRcdFx0XHRjb25zdCByZXRFbmRDb2x1bW4gPSByZXRTdGFydENvbHVtbiArIG1bMF0ubGVuZ3RoO1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gY3JlYXRlRmluZE1hdGNoKG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIgKyBsaW5lRmVlZENudCwgcmV0U3RhcnRDb2x1bW4sIHN0YXJ0TGluZU51bWJlciArIGxpbmVGZWVkQ250LCByZXRFbmRDb2x1bW4pLCBtLCBjYXB0dXJlTWF0Y2hlcyk7XG5cblx0XHRcdFx0aWYgKG9mZnNldEluQnVmZmVyKG0uaW5kZXgpICsgbVswXS5sZW5ndGggPj0gZW5kKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdWx0TGVuID49IGxpbWl0UmVzdWx0Q291bnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9IHdoaWxlIChtKTtcblxuXHRcdHJldHVybiByZXN1bHRMZW47XG5cdH1cblxuXHRwdWJsaWMgZmluZE1hdGNoZXNMaW5lQnlMaW5lKHNlYXJjaFJhbmdlOiBSYW5nZSwgc2VhcmNoRGF0YTogU2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IEZpbmRNYXRjaFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IEZpbmRNYXRjaFtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0Y29uc3Qgc2VhcmNoZXIgPSBuZXcgU2VhcmNoZXIoc2VhcmNoRGF0YS53b3JkU2VwYXJhdG9ycywgc2VhcmNoRGF0YS5yZWdleCk7XG5cblx0XHRsZXQgc3RhcnRQb3NpdGlvbiA9IHRoaXMubm9kZUF0MihzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXIsIHNlYXJjaFJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRpZiAoc3RhcnRQb3NpdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IHRoaXMubm9kZUF0MihzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyLCBzZWFyY2hSYW5nZS5lbmRDb2x1bW4pO1xuXHRcdGlmIChlbmRQb3NpdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRsZXQgc3RhcnQgPSB0aGlzLnBvc2l0aW9uSW5CdWZmZXIoc3RhcnRQb3NpdGlvbi5ub2RlLCBzdGFydFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cdFx0Y29uc3QgZW5kID0gdGhpcy5wb3NpdGlvbkluQnVmZmVyKGVuZFBvc2l0aW9uLm5vZGUsIGVuZFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cblx0XHRpZiAoc3RhcnRQb3NpdGlvbi5ub2RlID09PSBlbmRQb3NpdGlvbi5ub2RlKSB7XG5cdFx0XHR0aGlzLmZpbmRNYXRjaGVzSW5Ob2RlKHN0YXJ0UG9zaXRpb24ubm9kZSwgc2VhcmNoZXIsIHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlciwgc2VhcmNoUmFuZ2Uuc3RhcnRDb2x1bW4sIHN0YXJ0LCBlbmQsIHNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50LCByZXN1bHRMZW4sIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGxldCBzdGFydExpbmVOdW1iZXIgPSBzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cblx0XHRsZXQgY3VycmVudE5vZGUgPSBzdGFydFBvc2l0aW9uLm5vZGU7XG5cdFx0d2hpbGUgKGN1cnJlbnROb2RlICE9PSBlbmRQb3NpdGlvbi5ub2RlKSB7XG5cdFx0XHRjb25zdCBsaW5lQnJlYWtDbnQgPSB0aGlzLmdldExpbmVGZWVkQ250KGN1cnJlbnROb2RlLnBpZWNlLmJ1ZmZlckluZGV4LCBzdGFydCwgY3VycmVudE5vZGUucGllY2UuZW5kKTtcblxuXHRcdFx0aWYgKGxpbmVCcmVha0NudCA+PSAxKSB7XG5cdFx0XHRcdC8vIGxhc3QgbGluZSBicmVhayBwb3NpdGlvblxuXHRcdFx0XHRjb25zdCBsaW5lU3RhcnRzID0gdGhpcy5fYnVmZmVyc1tjdXJyZW50Tm9kZS5waWVjZS5idWZmZXJJbmRleF0ubGluZVN0YXJ0cztcblx0XHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXRJbkJ1ZmZlciA9IHRoaXMub2Zmc2V0SW5CdWZmZXIoY3VycmVudE5vZGUucGllY2UuYnVmZmVySW5kZXgsIGN1cnJlbnROb2RlLnBpZWNlLnN0YXJ0KTtcblx0XHRcdFx0Y29uc3QgbmV4dExpbmVTdGFydE9mZnNldCA9IGxpbmVTdGFydHNbc3RhcnQubGluZSArIGxpbmVCcmVha0NudF07XG5cdFx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gc3RhcnRMaW5lTnVtYmVyID09PSBzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXIgPyBzZWFyY2hSYW5nZS5zdGFydENvbHVtbiA6IDE7XG5cdFx0XHRcdHJlc3VsdExlbiA9IHRoaXMuZmluZE1hdGNoZXNJbk5vZGUoY3VycmVudE5vZGUsIHNlYXJjaGVyLCBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBzdGFydCwgdGhpcy5wb3NpdGlvbkluQnVmZmVyKGN1cnJlbnROb2RlLCBuZXh0TGluZVN0YXJ0T2Zmc2V0IC0gc3RhcnRPZmZzZXRJbkJ1ZmZlciksIHNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50LCByZXN1bHRMZW4sIHJlc3VsdCk7XG5cblx0XHRcdFx0aWYgKHJlc3VsdExlbiA+PSBsaW1pdFJlc3VsdENvdW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciArPSBsaW5lQnJlYWtDbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gc3RhcnRMaW5lTnVtYmVyID09PSBzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXIgPyBzZWFyY2hSYW5nZS5zdGFydENvbHVtbiAtIDEgOiAwO1xuXHRcdFx0Ly8gc2VhcmNoIGZvciB0aGUgcmVtYWluaW5nIGNvbnRlbnRcblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgPT09IHNlYXJjaFJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKS5zdWJzdHJpbmcoc3RhcnRDb2x1bW4sIHNlYXJjaFJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdFx0XHRyZXN1bHRMZW4gPSB0aGlzLl9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhLCBzZWFyY2hlciwgdGV4dCwgc2VhcmNoUmFuZ2UuZW5kTGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHJlc3VsdExlbiwgcmVzdWx0LCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdExlbiA9IHRoaXMuX2ZpbmRNYXRjaGVzSW5MaW5lKHNlYXJjaERhdGEsIHNlYXJjaGVyLCB0aGlzLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcikuc3Vic3RyKHN0YXJ0Q29sdW1uKSwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgcmVzdWx0TGVuLCByZXN1bHQsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblxuXHRcdFx0aWYgKHJlc3VsdExlbiA+PSBsaW1pdFJlc3VsdENvdW50KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdHN0YXJ0TGluZU51bWJlcisrO1xuXHRcdFx0c3RhcnRQb3NpdGlvbiA9IHRoaXMubm9kZUF0MihzdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0Y3VycmVudE5vZGUgPSBzdGFydFBvc2l0aW9uLm5vZGU7XG5cdFx0XHRzdGFydCA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihzdGFydFBvc2l0aW9uLm5vZGUsIHN0YXJ0UG9zaXRpb24ucmVtYWluZGVyKTtcblx0XHR9XG5cblx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyID09PSBzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IHN0YXJ0TGluZU51bWJlciA9PT0gc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID8gc2VhcmNoUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIDogMDtcblx0XHRcdGNvbnN0IHRleHQgPSB0aGlzLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcikuc3Vic3RyaW5nKHN0YXJ0Q29sdW1uLCBzZWFyY2hSYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdHJlc3VsdExlbiA9IHRoaXMuX2ZpbmRNYXRjaGVzSW5MaW5lKHNlYXJjaERhdGEsIHNlYXJjaGVyLCB0ZXh0LCBzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgcmVzdWx0TGVuLCByZXN1bHQsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBzdGFydExpbmVOdW1iZXIgPT09IHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlciA/IHNlYXJjaFJhbmdlLnN0YXJ0Q29sdW1uIDogMTtcblx0XHRyZXN1bHRMZW4gPSB0aGlzLmZpbmRNYXRjaGVzSW5Ob2RlKGVuZFBvc2l0aW9uLm5vZGUsIHNlYXJjaGVyLCBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBzdGFydCwgZW5kLCBzZWFyY2hEYXRhLCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCwgcmVzdWx0TGVuLCByZXN1bHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhOiBTZWFyY2hEYXRhLCBzZWFyY2hlcjogU2VhcmNoZXIsIHRleHQ6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyLCBkZWx0YU9mZnNldDogbnVtYmVyLCByZXN1bHRMZW46IG51bWJlciwgcmVzdWx0OiBGaW5kTWF0Y2hbXSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSBzZWFyY2hEYXRhLndvcmRTZXBhcmF0b3JzO1xuXHRcdGlmICghY2FwdHVyZU1hdGNoZXMgJiYgc2VhcmNoRGF0YS5zaW1wbGVTZWFyY2gpIHtcblx0XHRcdGNvbnN0IHNlYXJjaFN0cmluZyA9IHNlYXJjaERhdGEuc2ltcGxlU2VhcmNoO1xuXHRcdFx0Y29uc3Qgc2VhcmNoU3RyaW5nTGVuID0gc2VhcmNoU3RyaW5nLmxlbmd0aDtcblx0XHRcdGNvbnN0IHRleHRMZW5ndGggPSB0ZXh0Lmxlbmd0aDtcblxuXHRcdFx0bGV0IGxhc3RNYXRjaEluZGV4ID0gLXNlYXJjaFN0cmluZ0xlbjtcblx0XHRcdHdoaWxlICgobGFzdE1hdGNoSW5kZXggPSB0ZXh0LmluZGV4T2Yoc2VhcmNoU3RyaW5nLCBsYXN0TWF0Y2hJbmRleCArIHNlYXJjaFN0cmluZ0xlbikpICE9PSAtMSkge1xuXHRcdFx0XHRpZiAoIXdvcmRTZXBhcmF0b3JzIHx8IGlzVmFsaWRNYXRjaCh3b3JkU2VwYXJhdG9ycywgdGV4dCwgdGV4dExlbmd0aCwgbGFzdE1hdGNoSW5kZXgsIHNlYXJjaFN0cmluZ0xlbikpIHtcblx0XHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UobGluZU51bWJlciwgbGFzdE1hdGNoSW5kZXggKyAxICsgZGVsdGFPZmZzZXQsIGxpbmVOdW1iZXIsIGxhc3RNYXRjaEluZGV4ICsgMSArIHNlYXJjaFN0cmluZ0xlbiArIGRlbHRhT2Zmc2V0KSwgbnVsbCk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdExlbiA+PSBsaW1pdFJlc3VsdENvdW50KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0XHR9XG5cblx0XHRsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHQvLyBSZXNldCByZWdleCB0byBzZWFyY2ggZnJvbSB0aGUgYmVnaW5uaW5nXG5cdFx0c2VhcmNoZXIucmVzZXQoMCk7XG5cdFx0ZG8ge1xuXHRcdFx0bSA9IHNlYXJjaGVyLm5leHQodGV4dCk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gY3JlYXRlRmluZE1hdGNoKG5ldyBSYW5nZShsaW5lTnVtYmVyLCBtLmluZGV4ICsgMSArIGRlbHRhT2Zmc2V0LCBsaW5lTnVtYmVyLCBtLmluZGV4ICsgMSArIG1bMF0ubGVuZ3RoICsgZGVsdGFPZmZzZXQpLCBtLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0XHRcdGlmIChyZXN1bHRMZW4gPj0gbGltaXRSZXN1bHRDb3VudCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHRMZW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IHdoaWxlIChtKTtcblx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGllY2UgVGFibGVcblx0cHVibGljIGluc2VydChvZmZzZXQ6IG51bWJlciwgdmFsdWU6IHN0cmluZywgZW9sTm9ybWFsaXplZDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5fRU9MTm9ybWFsaXplZCA9IHRoaXMuX0VPTE5vcm1hbGl6ZWQgJiYgZW9sTm9ybWFsaXplZDtcblx0XHR0aGlzLl9sYXN0VmlzaXRlZExpbmUubGluZU51bWJlciA9IDA7XG5cdFx0dGhpcy5fbGFzdFZpc2l0ZWRMaW5lLnZhbHVlID0gJyc7XG5cblx0XHRpZiAodGhpcy5yb290ICE9PSBTRU5USU5FTCkge1xuXHRcdFx0Y29uc3QgeyBub2RlLCByZW1haW5kZXIsIG5vZGVTdGFydE9mZnNldCB9ID0gdGhpcy5ub2RlQXQob2Zmc2V0KTtcblx0XHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRcdGNvbnN0IGJ1ZmZlckluZGV4ID0gcGllY2UuYnVmZmVySW5kZXg7XG5cdFx0XHRjb25zdCBpbnNlcnRQb3NJbkJ1ZmZlciA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihub2RlLCByZW1haW5kZXIpO1xuXHRcdFx0aWYgKG5vZGUucGllY2UuYnVmZmVySW5kZXggPT09IDAgJiZcblx0XHRcdFx0cGllY2UuZW5kLmxpbmUgPT09IHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3MubGluZSAmJlxuXHRcdFx0XHRwaWVjZS5lbmQuY29sdW1uID09PSB0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zLmNvbHVtbiAmJlxuXHRcdFx0XHQobm9kZVN0YXJ0T2Zmc2V0ICsgcGllY2UubGVuZ3RoID09PSBvZmZzZXQpICYmXG5cdFx0XHRcdHZhbHVlLmxlbmd0aCA8IEF2ZXJhZ2VCdWZmZXJTaXplXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gY2hhbmdlZCBidWZmZXJcblx0XHRcdFx0dGhpcy5hcHBlbmRUb05vZGUobm9kZSwgdmFsdWUpO1xuXHRcdFx0XHR0aGlzLmNvbXB1dGVCdWZmZXJNZXRhZGF0YSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChub2RlU3RhcnRPZmZzZXQgPT09IG9mZnNldCkge1xuXHRcdFx0XHR0aGlzLmluc2VydENvbnRlbnRUb05vZGVMZWZ0KHZhbHVlLCBub2RlKTtcblx0XHRcdFx0dGhpcy5fc2VhcmNoQ2FjaGUudmFsaWRhdGUob2Zmc2V0KTtcblx0XHRcdH0gZWxzZSBpZiAobm9kZVN0YXJ0T2Zmc2V0ICsgbm9kZS5waWVjZS5sZW5ndGggPiBvZmZzZXQpIHtcblx0XHRcdFx0Ly8gd2UgYXJlIGluc2VydGluZyBpbnRvIHRoZSBtaWRkbGUgb2YgYSBub2RlLlxuXHRcdFx0XHRjb25zdCBub2Rlc1RvRGVsOiBUcmVlTm9kZVtdID0gW107XG5cdFx0XHRcdGxldCBuZXdSaWdodFBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0XHRcdHBpZWNlLmJ1ZmZlckluZGV4LFxuXHRcdFx0XHRcdGluc2VydFBvc0luQnVmZmVyLFxuXHRcdFx0XHRcdHBpZWNlLmVuZCxcblx0XHRcdFx0XHR0aGlzLmdldExpbmVGZWVkQ250KHBpZWNlLmJ1ZmZlckluZGV4LCBpbnNlcnRQb3NJbkJ1ZmZlciwgcGllY2UuZW5kKSxcblx0XHRcdFx0XHR0aGlzLm9mZnNldEluQnVmZmVyKGJ1ZmZlckluZGV4LCBwaWVjZS5lbmQpIC0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihidWZmZXJJbmRleCwgaW5zZXJ0UG9zSW5CdWZmZXIpXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkQ2hlY2tDUkxGKCkgJiYgdGhpcy5lbmRXaXRoQ1IodmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGVhZE9mUmlnaHQgPSB0aGlzLm5vZGVDaGFyQ29kZUF0KG5vZGUsIHJlbWFpbmRlcik7XG5cblx0XHRcdFx0XHRpZiAoaGVhZE9mUmlnaHQgPT09IDEwIC8qKiBcXG4gKi8pIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5ld1N0YXJ0OiBCdWZmZXJDdXJzb3IgPSB7IGxpbmU6IG5ld1JpZ2h0UGllY2Uuc3RhcnQubGluZSArIDEsIGNvbHVtbjogMCB9O1xuXHRcdFx0XHRcdFx0bmV3UmlnaHRQaWVjZSA9IG5ldyBQaWVjZShcblx0XHRcdFx0XHRcdFx0bmV3UmlnaHRQaWVjZS5idWZmZXJJbmRleCxcblx0XHRcdFx0XHRcdFx0bmV3U3RhcnQsXG5cdFx0XHRcdFx0XHRcdG5ld1JpZ2h0UGllY2UuZW5kLFxuXHRcdFx0XHRcdFx0XHR0aGlzLmdldExpbmVGZWVkQ250KG5ld1JpZ2h0UGllY2UuYnVmZmVySW5kZXgsIG5ld1N0YXJ0LCBuZXdSaWdodFBpZWNlLmVuZCksXG5cdFx0XHRcdFx0XHRcdG5ld1JpZ2h0UGllY2UubGVuZ3RoIC0gMVxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dmFsdWUgKz0gJ1xcbic7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcmV1c2Ugbm9kZSBmb3IgY29udGVudCBiZWZvcmUgaW5zZXJ0aW9uIHBvaW50LlxuXHRcdFx0XHRpZiAodGhpcy5zaG91bGRDaGVja0NSTEYoKSAmJiB0aGlzLnN0YXJ0V2l0aExGKHZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbnN0IHRhaWxPZkxlZnQgPSB0aGlzLm5vZGVDaGFyQ29kZUF0KG5vZGUsIHJlbWFpbmRlciAtIDEpO1xuXHRcdFx0XHRcdGlmICh0YWlsT2ZMZWZ0ID09PSAxMyAvKiogXFxyICovKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcmV2aW91c1BvcyA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihub2RlLCByZW1haW5kZXIgLSAxKTtcblx0XHRcdFx0XHRcdHRoaXMuZGVsZXRlTm9kZVRhaWwobm9kZSwgcHJldmlvdXNQb3MpO1xuXHRcdFx0XHRcdFx0dmFsdWUgPSAnXFxyJyArIHZhbHVlO1xuXG5cdFx0XHRcdFx0XHRpZiAobm9kZS5waWVjZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0bm9kZXNUb0RlbC5wdXNoKG5vZGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlbGV0ZU5vZGVUYWlsKG5vZGUsIGluc2VydFBvc0luQnVmZmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5kZWxldGVOb2RlVGFpbChub2RlLCBpbnNlcnRQb3NJbkJ1ZmZlcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZXdQaWVjZXMgPSB0aGlzLmNyZWF0ZU5ld1BpZWNlcyh2YWx1ZSk7XG5cdFx0XHRcdGlmIChuZXdSaWdodFBpZWNlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLnJiSW5zZXJ0UmlnaHQobm9kZSwgbmV3UmlnaHRQaWVjZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgdG1wTm9kZSA9IG5vZGU7XG5cdFx0XHRcdGZvciAobGV0IGsgPSAwOyBrIDwgbmV3UGllY2VzLmxlbmd0aDsgaysrKSB7XG5cdFx0XHRcdFx0dG1wTm9kZSA9IHRoaXMucmJJbnNlcnRSaWdodCh0bXBOb2RlLCBuZXdQaWVjZXNba10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZGVsZXRlTm9kZXMobm9kZXNUb0RlbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmluc2VydENvbnRlbnRUb05vZGVSaWdodCh2YWx1ZSwgbm9kZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGluc2VydCBuZXcgbm9kZVxuXHRcdFx0Y29uc3QgcGllY2VzID0gdGhpcy5jcmVhdGVOZXdQaWVjZXModmFsdWUpO1xuXHRcdFx0bGV0IG5vZGUgPSB0aGlzLnJiSW5zZXJ0TGVmdChudWxsLCBwaWVjZXNbMF0pO1xuXG5cdFx0XHRmb3IgKGxldCBrID0gMTsgayA8IHBpZWNlcy5sZW5ndGg7IGsrKykge1xuXHRcdFx0XHRub2RlID0gdGhpcy5yYkluc2VydFJpZ2h0KG5vZGUsIHBpZWNlc1trXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gdG9kbywgdGhpcyBpcyB0b28gYnJ1dGFsLiBUb3RhbCBsaW5lIGZlZWQgY291bnQgc2hvdWxkIGJlIHVwZGF0ZWQgdGhlIHNhbWUgd2F5IGFzIGxmX2xlZnQuXG5cdFx0dGhpcy5jb21wdXRlQnVmZmVyTWV0YWRhdGEoKTtcblx0fVxuXG5cdHB1YmxpYyBkZWxldGUob2Zmc2V0OiBudW1iZXIsIGNudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdFZpc2l0ZWRMaW5lLmxpbmVOdW1iZXIgPSAwO1xuXHRcdHRoaXMuX2xhc3RWaXNpdGVkTGluZS52YWx1ZSA9ICcnO1xuXG5cdFx0aWYgKGNudCA8PSAwIHx8IHRoaXMucm9vdCA9PT0gU0VOVElORUwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gdGhpcy5ub2RlQXQob2Zmc2V0KTtcblx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IHRoaXMubm9kZUF0KG9mZnNldCArIGNudCk7XG5cdFx0Y29uc3Qgc3RhcnROb2RlID0gc3RhcnRQb3NpdGlvbi5ub2RlO1xuXHRcdGNvbnN0IGVuZE5vZGUgPSBlbmRQb3NpdGlvbi5ub2RlO1xuXG5cdFx0aWYgKHN0YXJ0Tm9kZSA9PT0gZW5kTm9kZSkge1xuXHRcdFx0Y29uc3Qgc3RhcnRTcGxpdFBvc0luQnVmZmVyID0gdGhpcy5wb3NpdGlvbkluQnVmZmVyKHN0YXJ0Tm9kZSwgc3RhcnRQb3NpdGlvbi5yZW1haW5kZXIpO1xuXHRcdFx0Y29uc3QgZW5kU3BsaXRQb3NJbkJ1ZmZlciA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihzdGFydE5vZGUsIGVuZFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cblx0XHRcdGlmIChzdGFydFBvc2l0aW9uLm5vZGVTdGFydE9mZnNldCA9PT0gb2Zmc2V0KSB7XG5cdFx0XHRcdGlmIChjbnQgPT09IHN0YXJ0Tm9kZS5waWVjZS5sZW5ndGgpIHsgLy8gZGVsZXRlIG5vZGVcblx0XHRcdFx0XHRjb25zdCBuZXh0ID0gc3RhcnROb2RlLm5leHQoKTtcblx0XHRcdFx0XHRyYkRlbGV0ZSh0aGlzLCBzdGFydE5vZGUpO1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVDUkxGV2l0aFByZXZOb2RlKG5leHQpO1xuXHRcdFx0XHRcdHRoaXMuY29tcHV0ZUJ1ZmZlck1ldGFkYXRhKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZGVsZXRlTm9kZUhlYWQoc3RhcnROb2RlLCBlbmRTcGxpdFBvc0luQnVmZmVyKTtcblx0XHRcdFx0dGhpcy5fc2VhcmNoQ2FjaGUudmFsaWRhdGUob2Zmc2V0KTtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUNSTEZXaXRoUHJldk5vZGUoc3RhcnROb2RlKTtcblx0XHRcdFx0dGhpcy5jb21wdXRlQnVmZmVyTWV0YWRhdGEoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhcnRQb3NpdGlvbi5ub2RlU3RhcnRPZmZzZXQgKyBzdGFydE5vZGUucGllY2UubGVuZ3RoID09PSBvZmZzZXQgKyBjbnQpIHtcblx0XHRcdFx0dGhpcy5kZWxldGVOb2RlVGFpbChzdGFydE5vZGUsIHN0YXJ0U3BsaXRQb3NJbkJ1ZmZlcik7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVDUkxGV2l0aE5leHROb2RlKHN0YXJ0Tm9kZSk7XG5cdFx0XHRcdHRoaXMuY29tcHV0ZUJ1ZmZlck1ldGFkYXRhKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZGVsZXRlIGNvbnRlbnQgaW4gdGhlIG1pZGRsZSwgdGhpcyBub2RlIHdpbGwgYmUgc3BsaXR0ZWQgdG8gbm9kZXNcblx0XHRcdHRoaXMuc2hyaW5rTm9kZShzdGFydE5vZGUsIHN0YXJ0U3BsaXRQb3NJbkJ1ZmZlciwgZW5kU3BsaXRQb3NJbkJ1ZmZlcik7XG5cdFx0XHR0aGlzLmNvbXB1dGVCdWZmZXJNZXRhZGF0YSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGVzVG9EZWw6IFRyZWVOb2RlW10gPSBbXTtcblxuXHRcdGNvbnN0IHN0YXJ0U3BsaXRQb3NJbkJ1ZmZlciA9IHRoaXMucG9zaXRpb25JbkJ1ZmZlcihzdGFydE5vZGUsIHN0YXJ0UG9zaXRpb24ucmVtYWluZGVyKTtcblx0XHR0aGlzLmRlbGV0ZU5vZGVUYWlsKHN0YXJ0Tm9kZSwgc3RhcnRTcGxpdFBvc0luQnVmZmVyKTtcblx0XHR0aGlzLl9zZWFyY2hDYWNoZS52YWxpZGF0ZShvZmZzZXQpO1xuXHRcdGlmIChzdGFydE5vZGUucGllY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRub2Rlc1RvRGVsLnB1c2goc3RhcnROb2RlKTtcblx0XHR9XG5cblx0XHQvLyB1cGRhdGUgbGFzdCB0b3VjaGVkIG5vZGVcblx0XHRjb25zdCBlbmRTcGxpdFBvc0luQnVmZmVyID0gdGhpcy5wb3NpdGlvbkluQnVmZmVyKGVuZE5vZGUsIGVuZFBvc2l0aW9uLnJlbWFpbmRlcik7XG5cdFx0dGhpcy5kZWxldGVOb2RlSGVhZChlbmROb2RlLCBlbmRTcGxpdFBvc0luQnVmZmVyKTtcblx0XHRpZiAoZW5kTm9kZS5waWVjZS5sZW5ndGggPT09IDApIHtcblx0XHRcdG5vZGVzVG9EZWwucHVzaChlbmROb2RlKTtcblx0XHR9XG5cblx0XHQvLyBkZWxldGUgbm9kZXMgaW4gYmV0d2VlblxuXHRcdGNvbnN0IHNlY29uZE5vZGUgPSBzdGFydE5vZGUubmV4dCgpO1xuXHRcdGZvciAobGV0IG5vZGUgPSBzZWNvbmROb2RlOyBub2RlICE9PSBTRU5USU5FTCAmJiBub2RlICE9PSBlbmROb2RlOyBub2RlID0gbm9kZS5uZXh0KCkpIHtcblx0XHRcdG5vZGVzVG9EZWwucHVzaChub2RlKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2ID0gc3RhcnROb2RlLnBpZWNlLmxlbmd0aCA9PT0gMCA/IHN0YXJ0Tm9kZS5wcmV2KCkgOiBzdGFydE5vZGU7XG5cdFx0dGhpcy5kZWxldGVOb2Rlcyhub2Rlc1RvRGVsKTtcblx0XHR0aGlzLnZhbGlkYXRlQ1JMRldpdGhOZXh0Tm9kZShwcmV2KTtcblx0XHR0aGlzLmNvbXB1dGVCdWZmZXJNZXRhZGF0YSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnNlcnRDb250ZW50VG9Ob2RlTGVmdCh2YWx1ZTogc3RyaW5nLCBub2RlOiBUcmVlTm9kZSkge1xuXHRcdC8vIHdlIGFyZSBpbnNlcnRpbmcgY29udGVudCB0byB0aGUgYmVnaW5uaW5nIG9mIG5vZGVcblx0XHRjb25zdCBub2Rlc1RvRGVsOiBUcmVlTm9kZVtdID0gW107XG5cdFx0aWYgKHRoaXMuc2hvdWxkQ2hlY2tDUkxGKCkgJiYgdGhpcy5lbmRXaXRoQ1IodmFsdWUpICYmIHRoaXMuc3RhcnRXaXRoTEYobm9kZSkpIHtcblx0XHRcdC8vIG1vdmUgYFxcbmAgdG8gbmV3IG5vZGUuXG5cblx0XHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRcdGNvbnN0IG5ld1N0YXJ0OiBCdWZmZXJDdXJzb3IgPSB7IGxpbmU6IHBpZWNlLnN0YXJ0LmxpbmUgKyAxLCBjb2x1bW46IDAgfTtcblx0XHRcdGNvbnN0IG5QaWVjZSA9IG5ldyBQaWVjZShcblx0XHRcdFx0cGllY2UuYnVmZmVySW5kZXgsXG5cdFx0XHRcdG5ld1N0YXJ0LFxuXHRcdFx0XHRwaWVjZS5lbmQsXG5cdFx0XHRcdHRoaXMuZ2V0TGluZUZlZWRDbnQocGllY2UuYnVmZmVySW5kZXgsIG5ld1N0YXJ0LCBwaWVjZS5lbmQpLFxuXHRcdFx0XHRwaWVjZS5sZW5ndGggLSAxXG5cdFx0XHQpO1xuXG5cdFx0XHRub2RlLnBpZWNlID0gblBpZWNlO1xuXG5cdFx0XHR2YWx1ZSArPSAnXFxuJztcblx0XHRcdHVwZGF0ZVRyZWVNZXRhZGF0YSh0aGlzLCBub2RlLCAtMSwgLTEpO1xuXG5cdFx0XHRpZiAobm9kZS5waWVjZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bm9kZXNUb0RlbC5wdXNoKG5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1BpZWNlcyA9IHRoaXMuY3JlYXRlTmV3UGllY2VzKHZhbHVlKTtcblx0XHRsZXQgbmV3Tm9kZSA9IHRoaXMucmJJbnNlcnRMZWZ0KG5vZGUsIG5ld1BpZWNlc1tuZXdQaWVjZXMubGVuZ3RoIC0gMV0pO1xuXHRcdGZvciAobGV0IGsgPSBuZXdQaWVjZXMubGVuZ3RoIC0gMjsgayA+PSAwOyBrLS0pIHtcblx0XHRcdG5ld05vZGUgPSB0aGlzLnJiSW5zZXJ0TGVmdChuZXdOb2RlLCBuZXdQaWVjZXNba10pO1xuXHRcdH1cblx0XHR0aGlzLnZhbGlkYXRlQ1JMRldpdGhQcmV2Tm9kZShuZXdOb2RlKTtcblx0XHR0aGlzLmRlbGV0ZU5vZGVzKG5vZGVzVG9EZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnNlcnRDb250ZW50VG9Ob2RlUmlnaHQodmFsdWU6IHN0cmluZywgbm9kZTogVHJlZU5vZGUpIHtcblx0XHQvLyB3ZSBhcmUgaW5zZXJ0aW5nIHRvIHRoZSByaWdodCBvZiB0aGlzIG5vZGUuXG5cdFx0aWYgKHRoaXMuYWRqdXN0Q2FycmlhZ2VSZXR1cm5Gcm9tTmV4dCh2YWx1ZSwgbm9kZSkpIHtcblx0XHRcdC8vIG1vdmUgXFxuIHRvIHRoZSBuZXcgbm9kZS5cblx0XHRcdHZhbHVlICs9ICdcXG4nO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1BpZWNlcyA9IHRoaXMuY3JlYXRlTmV3UGllY2VzKHZhbHVlKTtcblx0XHRjb25zdCBuZXdOb2RlID0gdGhpcy5yYkluc2VydFJpZ2h0KG5vZGUsIG5ld1BpZWNlc1swXSk7XG5cdFx0bGV0IHRtcE5vZGUgPSBuZXdOb2RlO1xuXG5cdFx0Zm9yIChsZXQgayA9IDE7IGsgPCBuZXdQaWVjZXMubGVuZ3RoOyBrKyspIHtcblx0XHRcdHRtcE5vZGUgPSB0aGlzLnJiSW5zZXJ0UmlnaHQodG1wTm9kZSwgbmV3UGllY2VzW2tdKTtcblx0XHR9XG5cblx0XHR0aGlzLnZhbGlkYXRlQ1JMRldpdGhQcmV2Tm9kZShuZXdOb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgcG9zaXRpb25JbkJ1ZmZlcihub2RlOiBUcmVlTm9kZSwgcmVtYWluZGVyOiBudW1iZXIpOiBCdWZmZXJDdXJzb3I7XG5cdHByaXZhdGUgcG9zaXRpb25JbkJ1ZmZlcihub2RlOiBUcmVlTm9kZSwgcmVtYWluZGVyOiBudW1iZXIsIHJldDogQnVmZmVyQ3Vyc29yKTogbnVsbDtcblx0cHJpdmF0ZSBwb3NpdGlvbkluQnVmZmVyKG5vZGU6IFRyZWVOb2RlLCByZW1haW5kZXI6IG51bWJlciwgcmV0PzogQnVmZmVyQ3Vyc29yKTogQnVmZmVyQ3Vyc29yIHwgbnVsbCB7XG5cdFx0Y29uc3QgcGllY2UgPSBub2RlLnBpZWNlO1xuXHRcdGNvbnN0IGJ1ZmZlckluZGV4ID0gbm9kZS5waWVjZS5idWZmZXJJbmRleDtcblx0XHRjb25zdCBsaW5lU3RhcnRzID0gdGhpcy5fYnVmZmVyc1tidWZmZXJJbmRleF0ubGluZVN0YXJ0cztcblxuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gbGluZVN0YXJ0c1twaWVjZS5zdGFydC5saW5lXSArIHBpZWNlLnN0YXJ0LmNvbHVtbjtcblxuXHRcdGNvbnN0IG9mZnNldCA9IHN0YXJ0T2Zmc2V0ICsgcmVtYWluZGVyO1xuXG5cdFx0Ly8gYmluYXJ5IHNlYXJjaCBvZmZzZXQgYmV0d2VlbiBzdGFydE9mZnNldCBhbmQgZW5kT2Zmc2V0XG5cdFx0bGV0IGxvdyA9IHBpZWNlLnN0YXJ0LmxpbmU7XG5cdFx0bGV0IGhpZ2ggPSBwaWVjZS5lbmQubGluZTtcblxuXHRcdGxldCBtaWQ6IG51bWJlciA9IDA7XG5cdFx0bGV0IG1pZFN0b3A6IG51bWJlciA9IDA7XG5cdFx0bGV0IG1pZFN0YXJ0OiBudW1iZXIgPSAwO1xuXG5cdFx0d2hpbGUgKGxvdyA8PSBoaWdoKSB7XG5cdFx0XHRtaWQgPSBsb3cgKyAoKGhpZ2ggLSBsb3cpIC8gMikgfCAwO1xuXHRcdFx0bWlkU3RhcnQgPSBsaW5lU3RhcnRzW21pZF07XG5cblx0XHRcdGlmIChtaWQgPT09IGhpZ2gpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdG1pZFN0b3AgPSBsaW5lU3RhcnRzW21pZCArIDFdO1xuXG5cdFx0XHRpZiAob2Zmc2V0IDwgbWlkU3RhcnQpIHtcblx0XHRcdFx0aGlnaCA9IG1pZCAtIDE7XG5cdFx0XHR9IGVsc2UgaWYgKG9mZnNldCA+PSBtaWRTdG9wKSB7XG5cdFx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmV0KSB7XG5cdFx0XHRyZXQubGluZSA9IG1pZDtcblx0XHRcdHJldC5jb2x1bW4gPSBvZmZzZXQgLSBtaWRTdGFydDtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRsaW5lOiBtaWQsXG5cdFx0XHRjb2x1bW46IG9mZnNldCAtIG1pZFN0YXJ0XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGluZUZlZWRDbnQoYnVmZmVySW5kZXg6IG51bWJlciwgc3RhcnQ6IEJ1ZmZlckN1cnNvciwgZW5kOiBCdWZmZXJDdXJzb3IpOiBudW1iZXIge1xuXHRcdC8vIHdlIGRvbid0IG5lZWQgdG8gd29ycnkgYWJvdXQgc3RhcnQ6IGFiY1xccnxcXG4sIG9yIGFiY3xcXHIsIG9yIGFiY3xcXG4sIG9yIGFiY3xcXHJcXG4gZG9lc24ndCBjaGFuZ2UgdGhlIGZhY3QgdGhhdCwgdGhlcmUgaXMgb25lIGxpbmUgYnJlYWsgYWZ0ZXIgc3RhcnQuXG5cdFx0Ly8gbm93IGxldCdzIHRha2UgY2FyZSBvZiBlbmQ6IGFiY1xccnxcXG4sIGlmIGVuZCBpcyBpbiBiZXR3ZWVuIFxcciBhbmQgXFxuLCB3ZSBuZWVkIHRvIGFkZCBsaW5lIGZlZWQgY291bnQgYnkgMVxuXHRcdGlmIChlbmQuY29sdW1uID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZW5kLmxpbmUgLSBzdGFydC5saW5lO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVTdGFydHMgPSB0aGlzLl9idWZmZXJzW2J1ZmZlckluZGV4XS5saW5lU3RhcnRzO1xuXHRcdGlmIChlbmQubGluZSA9PT0gbGluZVN0YXJ0cy5sZW5ndGggLSAxKSB7IC8vIGl0IG1lYW5zLCB0aGVyZSBpcyBubyBcXG4gYWZ0ZXIgZW5kLCBvdGhlcndpc2UsIHRoZXJlIHdpbGwgYmUgb25lIG1vcmUgbGluZVN0YXJ0LlxuXHRcdFx0cmV0dXJuIGVuZC5saW5lIC0gc3RhcnQubGluZTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0TGluZVN0YXJ0T2Zmc2V0ID0gbGluZVN0YXJ0c1tlbmQubGluZSArIDFdO1xuXHRcdGNvbnN0IGVuZE9mZnNldCA9IGxpbmVTdGFydHNbZW5kLmxpbmVdICsgZW5kLmNvbHVtbjtcblx0XHRpZiAobmV4dExpbmVTdGFydE9mZnNldCA+IGVuZE9mZnNldCArIDEpIHsgLy8gdGhlcmUgYXJlIG1vcmUgdGhhbiAxIGNoYXJhY3RlciBhZnRlciBlbmQsIHdoaWNoIG1lYW5zIGl0IGNhbid0IGJlIFxcblxuXHRcdFx0cmV0dXJuIGVuZC5saW5lIC0gc3RhcnQubGluZTtcblx0XHR9XG5cdFx0Ly8gZW5kT2Zmc2V0ICsgMSA9PT0gbmV4dExpbmVTdGFydE9mZnNldFxuXHRcdC8vIGNoYXJhY3RlciBhdCBlbmRPZmZzZXQgaXMgXFxuLCBzbyB3ZSBjaGVjayB0aGUgY2hhcmFjdGVyIGJlZm9yZSBmaXJzdFxuXHRcdC8vIGlmIGNoYXJhY3RlciBhdCBlbmRPZmZzZXQgaXMgXFxyLCBlbmQuY29sdW1uIGlzIDAgYW5kIHdlIGNhbid0IGdldCBoZXJlLlxuXHRcdGNvbnN0IHByZXZpb3VzQ2hhck9mZnNldCA9IGVuZE9mZnNldCAtIDE7IC8vIGVuZC5jb2x1bW4gPiAwIHNvIGl0J3Mgb2theS5cblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW2J1ZmZlckluZGV4XS5idWZmZXI7XG5cblx0XHRpZiAoYnVmZmVyLmNoYXJDb2RlQXQocHJldmlvdXNDaGFyT2Zmc2V0KSA9PT0gMTMpIHtcblx0XHRcdHJldHVybiBlbmQubGluZSAtIHN0YXJ0LmxpbmUgKyAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZW5kLmxpbmUgLSBzdGFydC5saW5lO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb2Zmc2V0SW5CdWZmZXIoYnVmZmVySW5kZXg6IG51bWJlciwgY3Vyc29yOiBCdWZmZXJDdXJzb3IpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxpbmVTdGFydHMgPSB0aGlzLl9idWZmZXJzW2J1ZmZlckluZGV4XS5saW5lU3RhcnRzO1xuXHRcdHJldHVybiBsaW5lU3RhcnRzW2N1cnNvci5saW5lXSArIGN1cnNvci5jb2x1bW47XG5cdH1cblxuXHRwcml2YXRlIGRlbGV0ZU5vZGVzKG5vZGVzOiBUcmVlTm9kZVtdKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0cmJEZWxldGUodGhpcywgbm9kZXNbaV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTmV3UGllY2VzKHRleHQ6IHN0cmluZyk6IFBpZWNlW10ge1xuXHRcdGlmICh0ZXh0Lmxlbmd0aCA+IEF2ZXJhZ2VCdWZmZXJTaXplKSB7XG5cdFx0XHQvLyB0aGUgY29udGVudCBpcyBsYXJnZSwgb3BlcmF0aW9ucyBsaWtlIHN1YnN0cmluZywgY2hhckNvZGUgYmVjb21lcyBzbG93XG5cdFx0XHQvLyBzbyBoZXJlIHdlIHNwbGl0IGl0IGludG8gc21hbGxlciBjaHVua3MsIGp1c3QgbGlrZSB3aGF0IHdlIGRpZCBmb3IgQ1IvTEYgbm9ybWFsaXphdGlvblxuXHRcdFx0Y29uc3QgbmV3UGllY2VzOiBQaWVjZVtdID0gW107XG5cdFx0XHR3aGlsZSAodGV4dC5sZW5ndGggPiBBdmVyYWdlQnVmZmVyU2l6ZSkge1xuXHRcdFx0XHRjb25zdCBsYXN0Q2hhciA9IHRleHQuY2hhckNvZGVBdChBdmVyYWdlQnVmZmVyU2l6ZSAtIDEpO1xuXHRcdFx0XHRsZXQgc3BsaXRUZXh0O1xuXHRcdFx0XHRpZiAobGFzdENoYXIgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuIHx8IChsYXN0Q2hhciA+PSAweEQ4MDAgJiYgbGFzdENoYXIgPD0gMHhEQkZGKSkge1xuXHRcdFx0XHRcdC8vIGxhc3QgY2hhcmFjdGVyIGlzIFxcciBvciBhIGhpZ2ggc3Vycm9nYXRlID0+IGtlZXAgaXQgYmFja1xuXHRcdFx0XHRcdHNwbGl0VGV4dCA9IHRleHQuc3Vic3RyaW5nKDAsIEF2ZXJhZ2VCdWZmZXJTaXplIC0gMSk7XG5cdFx0XHRcdFx0dGV4dCA9IHRleHQuc3Vic3RyaW5nKEF2ZXJhZ2VCdWZmZXJTaXplIC0gMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3BsaXRUZXh0ID0gdGV4dC5zdWJzdHJpbmcoMCwgQXZlcmFnZUJ1ZmZlclNpemUpO1xuXHRcdFx0XHRcdHRleHQgPSB0ZXh0LnN1YnN0cmluZyhBdmVyYWdlQnVmZmVyU2l6ZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsaW5lU3RhcnRzID0gY3JlYXRlTGluZVN0YXJ0c0Zhc3Qoc3BsaXRUZXh0KTtcblx0XHRcdFx0bmV3UGllY2VzLnB1c2gobmV3IFBpZWNlKFxuXHRcdFx0XHRcdHRoaXMuX2J1ZmZlcnMubGVuZ3RoLCAvKiBidWZmZXIgaW5kZXggKi9cblx0XHRcdFx0XHR7IGxpbmU6IDAsIGNvbHVtbjogMCB9LFxuXHRcdFx0XHRcdHsgbGluZTogbGluZVN0YXJ0cy5sZW5ndGggLSAxLCBjb2x1bW46IHNwbGl0VGV4dC5sZW5ndGggLSBsaW5lU3RhcnRzW2xpbmVTdGFydHMubGVuZ3RoIC0gMV0gfSxcblx0XHRcdFx0XHRsaW5lU3RhcnRzLmxlbmd0aCAtIDEsXG5cdFx0XHRcdFx0c3BsaXRUZXh0Lmxlbmd0aFxuXHRcdFx0XHQpKTtcblx0XHRcdFx0dGhpcy5fYnVmZmVycy5wdXNoKG5ldyBTdHJpbmdCdWZmZXIoc3BsaXRUZXh0LCBsaW5lU3RhcnRzKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVTdGFydHMgPSBjcmVhdGVMaW5lU3RhcnRzRmFzdCh0ZXh0KTtcblx0XHRcdG5ld1BpZWNlcy5wdXNoKG5ldyBQaWVjZShcblx0XHRcdFx0dGhpcy5fYnVmZmVycy5sZW5ndGgsIC8qIGJ1ZmZlciBpbmRleCAqL1xuXHRcdFx0XHR7IGxpbmU6IDAsIGNvbHVtbjogMCB9LFxuXHRcdFx0XHR7IGxpbmU6IGxpbmVTdGFydHMubGVuZ3RoIC0gMSwgY29sdW1uOiB0ZXh0Lmxlbmd0aCAtIGxpbmVTdGFydHNbbGluZVN0YXJ0cy5sZW5ndGggLSAxXSB9LFxuXHRcdFx0XHRsaW5lU3RhcnRzLmxlbmd0aCAtIDEsXG5cdFx0XHRcdHRleHQubGVuZ3RoXG5cdFx0XHQpKTtcblx0XHRcdHRoaXMuX2J1ZmZlcnMucHVzaChuZXcgU3RyaW5nQnVmZmVyKHRleHQsIGxpbmVTdGFydHMpKTtcblxuXHRcdFx0cmV0dXJuIG5ld1BpZWNlcztcblx0XHR9XG5cblx0XHRsZXQgc3RhcnRPZmZzZXQgPSB0aGlzLl9idWZmZXJzWzBdLmJ1ZmZlci5sZW5ndGg7XG5cdFx0Y29uc3QgbGluZVN0YXJ0cyA9IGNyZWF0ZUxpbmVTdGFydHNGYXN0KHRleHQsIGZhbHNlKTtcblxuXHRcdGxldCBzdGFydCA9IHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3M7XG5cdFx0aWYgKHRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0c1t0aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHMubGVuZ3RoIC0gMV0gPT09IHN0YXJ0T2Zmc2V0XG5cdFx0XHQmJiBzdGFydE9mZnNldCAhPT0gMFxuXHRcdFx0JiYgdGhpcy5zdGFydFdpdGhMRih0ZXh0KVxuXHRcdFx0JiYgdGhpcy5lbmRXaXRoQ1IodGhpcy5fYnVmZmVyc1swXS5idWZmZXIpIC8vIHRvZG8sIHdlIGNhbiBjaGVjayB0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zJ3MgY29sdW1uIGFzIGl0J3MgdGhlIGxhc3Qgb25lXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zID0geyBsaW5lOiB0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zLmxpbmUsIGNvbHVtbjogdGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcy5jb2x1bW4gKyAxIH07XG5cdFx0XHRzdGFydCA9IHRoaXMuX2xhc3RDaGFuZ2VCdWZmZXJQb3M7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZVN0YXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRsaW5lU3RhcnRzW2ldICs9IHN0YXJ0T2Zmc2V0ICsgMTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzID0gKDxudW1iZXJbXT50aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHMpLmNvbmNhdCg8bnVtYmVyW10+bGluZVN0YXJ0cy5zbGljZSgxKSk7XG5cdFx0XHR0aGlzLl9idWZmZXJzWzBdLmJ1ZmZlciArPSAnXycgKyB0ZXh0O1xuXHRcdFx0c3RhcnRPZmZzZXQgKz0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHN0YXJ0T2Zmc2V0ICE9PSAwKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZVN0YXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGxpbmVTdGFydHNbaV0gKz0gc3RhcnRPZmZzZXQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0cyA9ICg8bnVtYmVyW10+dGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzKS5jb25jYXQoPG51bWJlcltdPmxpbmVTdGFydHMuc2xpY2UoMSkpO1xuXHRcdFx0dGhpcy5fYnVmZmVyc1swXS5idWZmZXIgKz0gdGV4dDtcblx0XHR9XG5cblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLl9idWZmZXJzWzBdLmJ1ZmZlci5sZW5ndGg7XG5cdFx0Y29uc3QgZW5kSW5kZXggPSB0aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHMubGVuZ3RoIC0gMTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBlbmRPZmZzZXQgLSB0aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHNbZW5kSW5kZXhdO1xuXHRcdGNvbnN0IGVuZFBvcyA9IHsgbGluZTogZW5kSW5kZXgsIGNvbHVtbjogZW5kQ29sdW1uIH07XG5cdFx0Y29uc3QgbmV3UGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHQwLCAvKiogdG9kb0BwZW5nICovXG5cdFx0XHRzdGFydCxcblx0XHRcdGVuZFBvcyxcblx0XHRcdHRoaXMuZ2V0TGluZUZlZWRDbnQoMCwgc3RhcnQsIGVuZFBvcyksXG5cdFx0XHRlbmRPZmZzZXQgLSBzdGFydE9mZnNldFxuXHRcdCk7XG5cdFx0dGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcyA9IGVuZFBvcztcblx0XHRyZXR1cm4gW25ld1BpZWNlXTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lc1Jhd0NvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRDb250ZW50T2ZTdWJUcmVlKHRoaXMucm9vdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZVJhd0NvbnRlbnQobGluZU51bWJlcjogbnVtYmVyLCBlbmRPZmZzZXQ6IG51bWJlciA9IDApOiBzdHJpbmcge1xuXHRcdGxldCB4ID0gdGhpcy5yb290O1xuXG5cdFx0bGV0IHJldCA9ICcnO1xuXHRcdGNvbnN0IGNhY2hlID0gdGhpcy5fc2VhcmNoQ2FjaGUuZ2V0MihsaW5lTnVtYmVyKTtcblx0XHRpZiAoY2FjaGUpIHtcblx0XHRcdHggPSBjYWNoZS5ub2RlO1xuXHRcdFx0Y29uc3QgcHJldkFjY3VtdWxhdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgbGluZU51bWJlciAtIGNhY2hlLm5vZGVTdGFydExpbmVOdW1iZXIgLSAxKTtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbeC5waWVjZS5idWZmZXJJbmRleF0uYnVmZmVyO1xuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKHgucGllY2UuYnVmZmVySW5kZXgsIHgucGllY2Uuc3RhcnQpO1xuXHRcdFx0aWYgKGNhY2hlLm5vZGVTdGFydExpbmVOdW1iZXIgKyB4LnBpZWNlLmxpbmVGZWVkQ250ID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldCA9IGJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQgKyBwcmV2QWNjdW11bGF0ZWRWYWx1ZSwgc3RhcnRPZmZzZXQgKyB4LnBpZWNlLmxlbmd0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBhY2N1bXVsYXRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIGxpbmVOdW1iZXIgLSBjYWNoZS5ub2RlU3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0cmV0dXJuIGJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQgKyBwcmV2QWNjdW11bGF0ZWRWYWx1ZSwgc3RhcnRPZmZzZXQgKyBhY2N1bXVsYXRlZFZhbHVlIC0gZW5kT2Zmc2V0KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IG5vZGVTdGFydE9mZnNldCA9IDA7XG5cdFx0XHRjb25zdCBvcmlnaW5hbExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRcdGlmICh4LmxlZnQgIT09IFNFTlRJTkVMICYmIHgubGZfbGVmdCA+PSBsaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0XHRcdHggPSB4LmxlZnQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoeC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudCA+IGxpbmVOdW1iZXIgLSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJldkFjY3VtdWxhdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgbGluZU51bWJlciAtIHgubGZfbGVmdCAtIDIpO1xuXHRcdFx0XHRcdGNvbnN0IGFjY3VtdWxhdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgbGluZU51bWJlciAtIHgubGZfbGVmdCAtIDEpO1xuXHRcdFx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbeC5waWVjZS5idWZmZXJJbmRleF0uYnVmZmVyO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcih4LnBpZWNlLmJ1ZmZlckluZGV4LCB4LnBpZWNlLnN0YXJ0KTtcblx0XHRcdFx0XHRub2RlU3RhcnRPZmZzZXQgKz0geC5zaXplX2xlZnQ7XG5cdFx0XHRcdFx0dGhpcy5fc2VhcmNoQ2FjaGUuc2V0KHtcblx0XHRcdFx0XHRcdG5vZGU6IHgsXG5cdFx0XHRcdFx0XHRub2RlU3RhcnRPZmZzZXQsXG5cdFx0XHRcdFx0XHRub2RlU3RhcnRMaW5lTnVtYmVyOiBvcmlnaW5hbExpbmVOdW1iZXIgLSAobGluZU51bWJlciAtIDEgLSB4LmxmX2xlZnQpXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gYnVmZmVyLnN1YnN0cmluZyhzdGFydE9mZnNldCArIHByZXZBY2N1bXVsYXRlZFZhbHVlLCBzdGFydE9mZnNldCArIGFjY3VtdWxhdGVkVmFsdWUgLSBlbmRPZmZzZXQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHgubGZfbGVmdCArIHgucGllY2UubGluZUZlZWRDbnQgPT09IGxpbmVOdW1iZXIgLSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJldkFjY3VtdWxhdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgbGluZU51bWJlciAtIHgubGZfbGVmdCAtIDIpO1xuXHRcdFx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbeC5waWVjZS5idWZmZXJJbmRleF0uYnVmZmVyO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcih4LnBpZWNlLmJ1ZmZlckluZGV4LCB4LnBpZWNlLnN0YXJ0KTtcblxuXHRcdFx0XHRcdHJldCA9IGJ1ZmZlci5zdWJzdHJpbmcoc3RhcnRPZmZzZXQgKyBwcmV2QWNjdW11bGF0ZWRWYWx1ZSwgc3RhcnRPZmZzZXQgKyB4LnBpZWNlLmxlbmd0aCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGluZU51bWJlciAtPSB4LmxmX2xlZnQgKyB4LnBpZWNlLmxpbmVGZWVkQ250O1xuXHRcdFx0XHRcdG5vZGVTdGFydE9mZnNldCArPSB4LnNpemVfbGVmdCArIHgucGllY2UubGVuZ3RoO1xuXHRcdFx0XHRcdHggPSB4LnJpZ2h0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc2VhcmNoIGluIG9yZGVyLCB0byBmaW5kIHRoZSBub2RlIGNvbnRhaW5zIGVuZCBjb2x1bW5cblx0XHR4ID0geC5uZXh0KCk7XG5cdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW3gucGllY2UuYnVmZmVySW5kZXhdLmJ1ZmZlcjtcblxuXHRcdFx0aWYgKHgucGllY2UubGluZUZlZWRDbnQgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGFjY3VtdWxhdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgMCk7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcih4LnBpZWNlLmJ1ZmZlckluZGV4LCB4LnBpZWNlLnN0YXJ0KTtcblxuXHRcdFx0XHRyZXQgKz0gYnVmZmVyLnN1YnN0cmluZyhzdGFydE9mZnNldCwgc3RhcnRPZmZzZXQgKyBhY2N1bXVsYXRlZFZhbHVlIC0gZW5kT2Zmc2V0KTtcblx0XHRcdFx0cmV0dXJuIHJldDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcih4LnBpZWNlLmJ1ZmZlckluZGV4LCB4LnBpZWNlLnN0YXJ0KTtcblx0XHRcdFx0cmV0ICs9IGJ1ZmZlci5zdWJzdHIoc3RhcnRPZmZzZXQsIHgucGllY2UubGVuZ3RoKTtcblx0XHRcdH1cblxuXHRcdFx0eCA9IHgubmV4dCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVCdWZmZXJNZXRhZGF0YSgpIHtcblx0XHRsZXQgeCA9IHRoaXMucm9vdDtcblxuXHRcdGxldCBsZkNudCA9IDE7XG5cdFx0bGV0IGxlbiA9IDA7XG5cblx0XHR3aGlsZSAoeCAhPT0gU0VOVElORUwpIHtcblx0XHRcdGxmQ250ICs9IHgubGZfbGVmdCArIHgucGllY2UubGluZUZlZWRDbnQ7XG5cdFx0XHRsZW4gKz0geC5zaXplX2xlZnQgKyB4LnBpZWNlLmxlbmd0aDtcblx0XHRcdHggPSB4LnJpZ2h0O1xuXHRcdH1cblxuXHRcdHRoaXMuX2xpbmVDbnQgPSBsZkNudDtcblx0XHR0aGlzLl9sZW5ndGggPSBsZW47XG5cdFx0dGhpcy5fc2VhcmNoQ2FjaGUudmFsaWRhdGUodGhpcy5fbGVuZ3RoKTtcblx0fVxuXG5cdC8vICNyZWdpb24gbm9kZSBvcGVyYXRpb25zXG5cdHByaXZhdGUgZ2V0SW5kZXhPZihub2RlOiBUcmVlTm9kZSwgYWNjdW11bGF0ZWRWYWx1ZTogbnVtYmVyKTogeyBpbmRleDogbnVtYmVyOyByZW1haW5kZXI6IG51bWJlciB9IHtcblx0XHRjb25zdCBwaWVjZSA9IG5vZGUucGllY2U7XG5cdFx0Y29uc3QgcG9zID0gdGhpcy5wb3NpdGlvbkluQnVmZmVyKG5vZGUsIGFjY3VtdWxhdGVkVmFsdWUpO1xuXHRcdGNvbnN0IGxpbmVDbnQgPSBwb3MubGluZSAtIHBpZWNlLnN0YXJ0LmxpbmU7XG5cblx0XHRpZiAodGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgcGllY2UuZW5kKSAtIHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLnN0YXJ0KSA9PT0gYWNjdW11bGF0ZWRWYWx1ZSkge1xuXHRcdFx0Ly8gd2UgYXJlIGNoZWNraW5nIHRoZSBlbmQgb2YgdGhpcyBub2RlLCBzbyBhIENSTEYgY2hlY2sgaXMgbmVjZXNzYXJ5LlxuXHRcdFx0Y29uc3QgcmVhbExpbmVDbnQgPSB0aGlzLmdldExpbmVGZWVkQ250KG5vZGUucGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLnN0YXJ0LCBwb3MpO1xuXHRcdFx0aWYgKHJlYWxMaW5lQ250ICE9PSBsaW5lQ250KSB7XG5cdFx0XHRcdC8vIGFoYSB5ZXMsIENSTEZcblx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHJlYWxMaW5lQ250LCByZW1haW5kZXI6IDAgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBpbmRleDogbGluZUNudCwgcmVtYWluZGVyOiBwb3MuY29sdW1uIH07XG5cdH1cblxuXHRwcml2YXRlIGdldEFjY3VtdWxhdGVkVmFsdWUobm9kZTogVHJlZU5vZGUsIGluZGV4OiBudW1iZXIpIHtcblx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0Y29uc3QgcGllY2UgPSBub2RlLnBpZWNlO1xuXHRcdGNvbnN0IGxpbmVTdGFydHMgPSB0aGlzLl9idWZmZXJzW3BpZWNlLmJ1ZmZlckluZGV4XS5saW5lU3RhcnRzO1xuXHRcdGNvbnN0IGV4cGVjdGVkTGluZVN0YXJ0SW5kZXggPSBwaWVjZS5zdGFydC5saW5lICsgaW5kZXggKyAxO1xuXHRcdGlmIChleHBlY3RlZExpbmVTdGFydEluZGV4ID4gcGllY2UuZW5kLmxpbmUpIHtcblx0XHRcdHJldHVybiBsaW5lU3RhcnRzW3BpZWNlLmVuZC5saW5lXSArIHBpZWNlLmVuZC5jb2x1bW4gLSBsaW5lU3RhcnRzW3BpZWNlLnN0YXJ0LmxpbmVdIC0gcGllY2Uuc3RhcnQuY29sdW1uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbGluZVN0YXJ0c1tleHBlY3RlZExpbmVTdGFydEluZGV4XSAtIGxpbmVTdGFydHNbcGllY2Uuc3RhcnQubGluZV0gLSBwaWVjZS5zdGFydC5jb2x1bW47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkZWxldGVOb2RlVGFpbChub2RlOiBUcmVlTm9kZSwgcG9zOiBCdWZmZXJDdXJzb3IpIHtcblx0XHRjb25zdCBwaWVjZSA9IG5vZGUucGllY2U7XG5cdFx0Y29uc3Qgb3JpZ2luYWxMRkNudCA9IHBpZWNlLmxpbmVGZWVkQ250O1xuXHRcdGNvbnN0IG9yaWdpbmFsRW5kT2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgcGllY2UuZW5kKTtcblxuXHRcdGNvbnN0IG5ld0VuZCA9IHBvcztcblx0XHRjb25zdCBuZXdFbmRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBuZXdFbmQpO1xuXHRcdGNvbnN0IG5ld0xpbmVGZWVkQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChwaWVjZS5idWZmZXJJbmRleCwgcGllY2Uuc3RhcnQsIG5ld0VuZCk7XG5cblx0XHRjb25zdCBsZl9kZWx0YSA9IG5ld0xpbmVGZWVkQ250IC0gb3JpZ2luYWxMRkNudDtcblx0XHRjb25zdCBzaXplX2RlbHRhID0gbmV3RW5kT2Zmc2V0IC0gb3JpZ2luYWxFbmRPZmZzZXQ7XG5cdFx0Y29uc3QgbmV3TGVuZ3RoID0gcGllY2UubGVuZ3RoICsgc2l6ZV9kZWx0YTtcblxuXHRcdG5vZGUucGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRwaWVjZS5idWZmZXJJbmRleCxcblx0XHRcdHBpZWNlLnN0YXJ0LFxuXHRcdFx0bmV3RW5kLFxuXHRcdFx0bmV3TGluZUZlZWRDbnQsXG5cdFx0XHRuZXdMZW5ndGhcblx0XHQpO1xuXG5cdFx0dXBkYXRlVHJlZU1ldGFkYXRhKHRoaXMsIG5vZGUsIHNpemVfZGVsdGEsIGxmX2RlbHRhKTtcblx0fVxuXG5cdHByaXZhdGUgZGVsZXRlTm9kZUhlYWQobm9kZTogVHJlZU5vZGUsIHBvczogQnVmZmVyQ3Vyc29yKSB7XG5cdFx0Y29uc3QgcGllY2UgPSBub2RlLnBpZWNlO1xuXHRcdGNvbnN0IG9yaWdpbmFsTEZDbnQgPSBwaWVjZS5saW5lRmVlZENudDtcblx0XHRjb25zdCBvcmlnaW5hbFN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgcGllY2Uuc3RhcnQpO1xuXG5cdFx0Y29uc3QgbmV3U3RhcnQgPSBwb3M7XG5cdFx0Y29uc3QgbmV3TGluZUZlZWRDbnQgPSB0aGlzLmdldExpbmVGZWVkQ250KHBpZWNlLmJ1ZmZlckluZGV4LCBuZXdTdGFydCwgcGllY2UuZW5kKTtcblx0XHRjb25zdCBuZXdTdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIG5ld1N0YXJ0KTtcblx0XHRjb25zdCBsZl9kZWx0YSA9IG5ld0xpbmVGZWVkQ250IC0gb3JpZ2luYWxMRkNudDtcblx0XHRjb25zdCBzaXplX2RlbHRhID0gb3JpZ2luYWxTdGFydE9mZnNldCAtIG5ld1N0YXJ0T2Zmc2V0O1xuXHRcdGNvbnN0IG5ld0xlbmd0aCA9IHBpZWNlLmxlbmd0aCArIHNpemVfZGVsdGE7XG5cdFx0bm9kZS5waWVjZSA9IG5ldyBQaWVjZShcblx0XHRcdHBpZWNlLmJ1ZmZlckluZGV4LFxuXHRcdFx0bmV3U3RhcnQsXG5cdFx0XHRwaWVjZS5lbmQsXG5cdFx0XHRuZXdMaW5lRmVlZENudCxcblx0XHRcdG5ld0xlbmd0aFxuXHRcdCk7XG5cblx0XHR1cGRhdGVUcmVlTWV0YWRhdGEodGhpcywgbm9kZSwgc2l6ZV9kZWx0YSwgbGZfZGVsdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaHJpbmtOb2RlKG5vZGU6IFRyZWVOb2RlLCBzdGFydDogQnVmZmVyQ3Vyc29yLCBlbmQ6IEJ1ZmZlckN1cnNvcikge1xuXHRcdGNvbnN0IHBpZWNlID0gbm9kZS5waWVjZTtcblx0XHRjb25zdCBvcmlnaW5hbFN0YXJ0UG9zID0gcGllY2Uuc3RhcnQ7XG5cdFx0Y29uc3Qgb3JpZ2luYWxFbmRQb3MgPSBwaWVjZS5lbmQ7XG5cblx0XHQvLyBvbGQgcGllY2UsIG9yaWdpbmFsU3RhcnRQb3MsIHN0YXJ0XG5cdFx0Y29uc3Qgb2xkTGVuZ3RoID0gcGllY2UubGVuZ3RoO1xuXHRcdGNvbnN0IG9sZExGQ250ID0gcGllY2UubGluZUZlZWRDbnQ7XG5cdFx0Y29uc3QgbmV3RW5kID0gc3RhcnQ7XG5cdFx0Y29uc3QgbmV3TGluZUZlZWRDbnQgPSB0aGlzLmdldExpbmVGZWVkQ250KHBpZWNlLmJ1ZmZlckluZGV4LCBwaWVjZS5zdGFydCwgbmV3RW5kKTtcblx0XHRjb25zdCBuZXdMZW5ndGggPSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBzdGFydCkgLSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBvcmlnaW5hbFN0YXJ0UG9zKTtcblxuXHRcdG5vZGUucGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRwaWVjZS5idWZmZXJJbmRleCxcblx0XHRcdHBpZWNlLnN0YXJ0LFxuXHRcdFx0bmV3RW5kLFxuXHRcdFx0bmV3TGluZUZlZWRDbnQsXG5cdFx0XHRuZXdMZW5ndGhcblx0XHQpO1xuXG5cdFx0dXBkYXRlVHJlZU1ldGFkYXRhKHRoaXMsIG5vZGUsIG5ld0xlbmd0aCAtIG9sZExlbmd0aCwgbmV3TGluZUZlZWRDbnQgLSBvbGRMRkNudCk7XG5cblx0XHQvLyBuZXcgcmlnaHQgcGllY2UsIGVuZCwgb3JpZ2luYWxFbmRQb3Ncblx0XHRjb25zdCBuZXdQaWVjZSA9IG5ldyBQaWVjZShcblx0XHRcdHBpZWNlLmJ1ZmZlckluZGV4LFxuXHRcdFx0ZW5kLFxuXHRcdFx0b3JpZ2luYWxFbmRQb3MsXG5cdFx0XHR0aGlzLmdldExpbmVGZWVkQ250KHBpZWNlLmJ1ZmZlckluZGV4LCBlbmQsIG9yaWdpbmFsRW5kUG9zKSxcblx0XHRcdHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIG9yaWdpbmFsRW5kUG9zKSAtIHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIGVuZClcblx0XHQpO1xuXG5cdFx0Y29uc3QgbmV3Tm9kZSA9IHRoaXMucmJJbnNlcnRSaWdodChub2RlLCBuZXdQaWVjZSk7XG5cdFx0dGhpcy52YWxpZGF0ZUNSTEZXaXRoUHJldk5vZGUobmV3Tm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZFRvTm9kZShub2RlOiBUcmVlTm9kZSwgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFkanVzdENhcnJpYWdlUmV0dXJuRnJvbU5leHQodmFsdWUsIG5vZGUpKSB7XG5cdFx0XHR2YWx1ZSArPSAnXFxuJztcblx0XHR9XG5cblx0XHRjb25zdCBoaXRDUkxGID0gdGhpcy5zaG91bGRDaGVja0NSTEYoKSAmJiB0aGlzLnN0YXJ0V2l0aExGKHZhbHVlKSAmJiB0aGlzLmVuZFdpdGhDUihub2RlKTtcblx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuX2J1ZmZlcnNbMF0uYnVmZmVyLmxlbmd0aDtcblx0XHR0aGlzLl9idWZmZXJzWzBdLmJ1ZmZlciArPSB2YWx1ZTtcblx0XHRjb25zdCBsaW5lU3RhcnRzID0gY3JlYXRlTGluZVN0YXJ0c0Zhc3QodmFsdWUsIGZhbHNlKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVTdGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGxpbmVTdGFydHNbaV0gKz0gc3RhcnRPZmZzZXQ7XG5cdFx0fVxuXHRcdGlmIChoaXRDUkxGKSB7XG5cdFx0XHRjb25zdCBwcmV2U3RhcnRPZmZzZXQgPSB0aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHNbdGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzLmxlbmd0aCAtIDJdO1xuXHRcdFx0KDxudW1iZXJbXT50aGlzLl9idWZmZXJzWzBdLmxpbmVTdGFydHMpLnBvcCgpO1xuXHRcdFx0Ly8gX2xhc3RDaGFuZ2VCdWZmZXJQb3MgaXMgYWxyZWFkeSB3cm9uZ1xuXHRcdFx0dGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcyA9IHsgbGluZTogdGhpcy5fbGFzdENoYW5nZUJ1ZmZlclBvcy5saW5lIC0gMSwgY29sdW1uOiBzdGFydE9mZnNldCAtIHByZXZTdGFydE9mZnNldCB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2J1ZmZlcnNbMF0ubGluZVN0YXJ0cyA9ICg8bnVtYmVyW10+dGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzKS5jb25jYXQoPG51bWJlcltdPmxpbmVTdGFydHMuc2xpY2UoMSkpO1xuXHRcdGNvbnN0IGVuZEluZGV4ID0gdGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzLmxlbmd0aCAtIDE7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gdGhpcy5fYnVmZmVyc1swXS5idWZmZXIubGVuZ3RoIC0gdGhpcy5fYnVmZmVyc1swXS5saW5lU3RhcnRzW2VuZEluZGV4XTtcblx0XHRjb25zdCBuZXdFbmQgPSB7IGxpbmU6IGVuZEluZGV4LCBjb2x1bW46IGVuZENvbHVtbiB9O1xuXHRcdGNvbnN0IG5ld0xlbmd0aCA9IG5vZGUucGllY2UubGVuZ3RoICsgdmFsdWUubGVuZ3RoO1xuXHRcdGNvbnN0IG9sZExpbmVGZWVkQ250ID0gbm9kZS5waWVjZS5saW5lRmVlZENudDtcblx0XHRjb25zdCBuZXdMaW5lRmVlZENudCA9IHRoaXMuZ2V0TGluZUZlZWRDbnQoMCwgbm9kZS5waWVjZS5zdGFydCwgbmV3RW5kKTtcblx0XHRjb25zdCBsZl9kZWx0YSA9IG5ld0xpbmVGZWVkQ250IC0gb2xkTGluZUZlZWRDbnQ7XG5cblx0XHRub2RlLnBpZWNlID0gbmV3IFBpZWNlKFxuXHRcdFx0bm9kZS5waWVjZS5idWZmZXJJbmRleCxcblx0XHRcdG5vZGUucGllY2Uuc3RhcnQsXG5cdFx0XHRuZXdFbmQsXG5cdFx0XHRuZXdMaW5lRmVlZENudCxcblx0XHRcdG5ld0xlbmd0aFxuXHRcdCk7XG5cblx0XHR0aGlzLl9sYXN0Q2hhbmdlQnVmZmVyUG9zID0gbmV3RW5kO1xuXHRcdHVwZGF0ZVRyZWVNZXRhZGF0YSh0aGlzLCBub2RlLCB2YWx1ZS5sZW5ndGgsIGxmX2RlbHRhKTtcblx0fVxuXG5cdHByaXZhdGUgbm9kZUF0KG9mZnNldDogbnVtYmVyKTogTm9kZVBvc2l0aW9uIHtcblx0XHRsZXQgeCA9IHRoaXMucm9vdDtcblx0XHRjb25zdCBjYWNoZSA9IHRoaXMuX3NlYXJjaENhY2hlLmdldChvZmZzZXQpO1xuXHRcdGlmIChjYWNoZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bm9kZTogY2FjaGUubm9kZSxcblx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0OiBjYWNoZS5ub2RlU3RhcnRPZmZzZXQsXG5cdFx0XHRcdHJlbWFpbmRlcjogb2Zmc2V0IC0gY2FjaGUubm9kZVN0YXJ0T2Zmc2V0XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGxldCBub2RlU3RhcnRPZmZzZXQgPSAwO1xuXG5cdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRpZiAoeC5zaXplX2xlZnQgPiBvZmZzZXQpIHtcblx0XHRcdFx0eCA9IHgubGVmdDtcblx0XHRcdH0gZWxzZSBpZiAoeC5zaXplX2xlZnQgKyB4LnBpZWNlLmxlbmd0aCA+PSBvZmZzZXQpIHtcblx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0ICs9IHguc2l6ZV9sZWZ0O1xuXHRcdFx0XHRjb25zdCByZXQgPSB7XG5cdFx0XHRcdFx0bm9kZTogeCxcblx0XHRcdFx0XHRyZW1haW5kZXI6IG9mZnNldCAtIHguc2l6ZV9sZWZ0LFxuXHRcdFx0XHRcdG5vZGVTdGFydE9mZnNldFxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl9zZWFyY2hDYWNoZS5zZXQocmV0KTtcblx0XHRcdFx0cmV0dXJuIHJldDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9mZnNldCAtPSB4LnNpemVfbGVmdCArIHgucGllY2UubGVuZ3RoO1xuXHRcdFx0XHRub2RlU3RhcnRPZmZzZXQgKz0geC5zaXplX2xlZnQgKyB4LnBpZWNlLmxlbmd0aDtcblx0XHRcdFx0eCA9IHgucmlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGwhO1xuXHR9XG5cblx0cHJpdmF0ZSBub2RlQXQyKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBOb2RlUG9zaXRpb24ge1xuXHRcdGxldCB4ID0gdGhpcy5yb290O1xuXHRcdGxldCBub2RlU3RhcnRPZmZzZXQgPSAwO1xuXG5cdFx0d2hpbGUgKHggIT09IFNFTlRJTkVMKSB7XG5cdFx0XHRpZiAoeC5sZWZ0ICE9PSBTRU5USU5FTCAmJiB4LmxmX2xlZnQgPj0gbGluZU51bWJlciAtIDEpIHtcblx0XHRcdFx0eCA9IHgubGVmdDtcblx0XHRcdH0gZWxzZSBpZiAoeC5sZl9sZWZ0ICsgeC5waWVjZS5saW5lRmVlZENudCA+IGxpbmVOdW1iZXIgLSAxKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZBY2N1bXVhbHRlZFZhbHVlID0gdGhpcy5nZXRBY2N1bXVsYXRlZFZhbHVlKHgsIGxpbmVOdW1iZXIgLSB4LmxmX2xlZnQgLSAyKTtcblx0XHRcdFx0Y29uc3QgYWNjdW11bGF0ZWRWYWx1ZSA9IHRoaXMuZ2V0QWNjdW11bGF0ZWRWYWx1ZSh4LCBsaW5lTnVtYmVyIC0geC5sZl9sZWZ0IC0gMSk7XG5cdFx0XHRcdG5vZGVTdGFydE9mZnNldCArPSB4LnNpemVfbGVmdDtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5vZGU6IHgsXG5cdFx0XHRcdFx0cmVtYWluZGVyOiBNYXRoLm1pbihwcmV2QWNjdW11YWx0ZWRWYWx1ZSArIGNvbHVtbiAtIDEsIGFjY3VtdWxhdGVkVmFsdWUpLFxuXHRcdFx0XHRcdG5vZGVTdGFydE9mZnNldFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmICh4LmxmX2xlZnQgKyB4LnBpZWNlLmxpbmVGZWVkQ250ID09PSBsaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0XHRjb25zdCBwcmV2QWNjdW11YWx0ZWRWYWx1ZSA9IHRoaXMuZ2V0QWNjdW11bGF0ZWRWYWx1ZSh4LCBsaW5lTnVtYmVyIC0geC5sZl9sZWZ0IC0gMik7XG5cdFx0XHRcdGlmIChwcmV2QWNjdW11YWx0ZWRWYWx1ZSArIGNvbHVtbiAtIDEgPD0geC5waWVjZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bm9kZTogeCxcblx0XHRcdFx0XHRcdHJlbWFpbmRlcjogcHJldkFjY3VtdWFsdGVkVmFsdWUgKyBjb2x1bW4gLSAxLFxuXHRcdFx0XHRcdFx0bm9kZVN0YXJ0T2Zmc2V0XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb2x1bW4gLT0geC5waWVjZS5sZW5ndGggLSBwcmV2QWNjdW11YWx0ZWRWYWx1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGluZU51bWJlciAtPSB4LmxmX2xlZnQgKyB4LnBpZWNlLmxpbmVGZWVkQ250O1xuXHRcdFx0XHRub2RlU3RhcnRPZmZzZXQgKz0geC5zaXplX2xlZnQgKyB4LnBpZWNlLmxlbmd0aDtcblx0XHRcdFx0eCA9IHgucmlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc2VhcmNoIGluIG9yZGVyLCB0byBmaW5kIHRoZSBub2RlIGNvbnRhaW5zIHBvc2l0aW9uLmNvbHVtblxuXHRcdHggPSB4Lm5leHQoKTtcblx0XHR3aGlsZSAoeCAhPT0gU0VOVElORUwpIHtcblxuXHRcdFx0aWYgKHgucGllY2UubGluZUZlZWRDbnQgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGFjY3VtdWxhdGVkVmFsdWUgPSB0aGlzLmdldEFjY3VtdWxhdGVkVmFsdWUoeCwgMCk7XG5cdFx0XHRcdGNvbnN0IG5vZGVTdGFydE9mZnNldCA9IHRoaXMub2Zmc2V0T2ZOb2RlKHgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5vZGU6IHgsXG5cdFx0XHRcdFx0cmVtYWluZGVyOiBNYXRoLm1pbihjb2x1bW4gLSAxLCBhY2N1bXVsYXRlZFZhbHVlKSxcblx0XHRcdFx0XHRub2RlU3RhcnRPZmZzZXRcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh4LnBpZWNlLmxlbmd0aCA+PSBjb2x1bW4gLSAxKSB7XG5cdFx0XHRcdFx0Y29uc3Qgbm9kZVN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRPZk5vZGUoeCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG5vZGU6IHgsXG5cdFx0XHRcdFx0XHRyZW1haW5kZXI6IGNvbHVtbiAtIDEsXG5cdFx0XHRcdFx0XHRub2RlU3RhcnRPZmZzZXRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbHVtbiAtPSB4LnBpZWNlLmxlbmd0aDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR4ID0geC5uZXh0KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGwhO1xuXHR9XG5cblx0cHJpdmF0ZSBub2RlQ2hhckNvZGVBdChub2RlOiBUcmVlTm9kZSwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChub2RlLnBpZWNlLmxpbmVGZWVkQ250IDwgMSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9idWZmZXJzW25vZGUucGllY2UuYnVmZmVySW5kZXhdO1xuXHRcdGNvbnN0IG5ld09mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIobm9kZS5waWVjZS5idWZmZXJJbmRleCwgbm9kZS5waWVjZS5zdGFydCkgKyBvZmZzZXQ7XG5cdFx0cmV0dXJuIGJ1ZmZlci5idWZmZXIuY2hhckNvZGVBdChuZXdPZmZzZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvZmZzZXRPZk5vZGUobm9kZTogVHJlZU5vZGUpOiBudW1iZXIge1xuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGxldCBwb3MgPSBub2RlLnNpemVfbGVmdDtcblx0XHR3aGlsZSAobm9kZSAhPT0gdGhpcy5yb290KSB7XG5cdFx0XHRpZiAobm9kZS5wYXJlbnQucmlnaHQgPT09IG5vZGUpIHtcblx0XHRcdFx0cG9zICs9IG5vZGUucGFyZW50LnNpemVfbGVmdCArIG5vZGUucGFyZW50LnBpZWNlLmxlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0bm9kZSA9IG5vZGUucGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBwb3M7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBDUkxGXG5cdHByaXZhdGUgc2hvdWxkQ2hlY2tDUkxGKCkge1xuXHRcdHJldHVybiAhKHRoaXMuX0VPTE5vcm1hbGl6ZWQgJiYgdGhpcy5fRU9MID09PSAnXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXJ0V2l0aExGKHZhbDogc3RyaW5nIHwgVHJlZU5vZGUpOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB2YWwuY2hhckNvZGVBdCgwKSA9PT0gMTA7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbCA9PT0gU0VOVElORUwgfHwgdmFsLnBpZWNlLmxpbmVGZWVkQ250ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGllY2UgPSB2YWwucGllY2U7XG5cdFx0Y29uc3QgbGluZVN0YXJ0cyA9IHRoaXMuX2J1ZmZlcnNbcGllY2UuYnVmZmVySW5kZXhdLmxpbmVTdGFydHM7XG5cdFx0Y29uc3QgbGluZSA9IHBpZWNlLnN0YXJ0LmxpbmU7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSBsaW5lU3RhcnRzW2xpbmVdICsgcGllY2Uuc3RhcnQuY29sdW1uO1xuXHRcdGlmIChsaW5lID09PSBsaW5lU3RhcnRzLmxlbmd0aCAtIDEpIHtcblx0XHRcdC8vIGxhc3QgbGluZSwgc28gdGhlcmUgaXMgbm8gbGluZSBmZWVkIGF0IHRoZSBlbmQgb2YgdGhpcyBsaW5lXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IG5leHRMaW5lT2Zmc2V0ID0gbGluZVN0YXJ0c1tsaW5lICsgMV07XG5cdFx0aWYgKG5leHRMaW5lT2Zmc2V0ID4gc3RhcnRPZmZzZXQgKyAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9idWZmZXJzW3BpZWNlLmJ1ZmZlckluZGV4XS5idWZmZXIuY2hhckNvZGVBdChzdGFydE9mZnNldCkgPT09IDEwO1xuXHR9XG5cblx0cHJpdmF0ZSBlbmRXaXRoQ1IodmFsOiBzdHJpbmcgfCBUcmVlTm9kZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHZhbC5jaGFyQ29kZUF0KHZhbC5sZW5ndGggLSAxKSA9PT0gMTM7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbCA9PT0gU0VOVElORUwgfHwgdmFsLnBpZWNlLmxpbmVGZWVkQ250ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubm9kZUNoYXJDb2RlQXQodmFsLCB2YWwucGllY2UubGVuZ3RoIC0gMSkgPT09IDEzO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUNSTEZXaXRoUHJldk5vZGUobmV4dE5vZGU6IFRyZWVOb2RlKSB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkQ2hlY2tDUkxGKCkgJiYgdGhpcy5zdGFydFdpdGhMRihuZXh0Tm9kZSkpIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBuZXh0Tm9kZS5wcmV2KCk7XG5cdFx0XHRpZiAodGhpcy5lbmRXaXRoQ1Iobm9kZSkpIHtcblx0XHRcdFx0dGhpcy5maXhDUkxGKG5vZGUsIG5leHROb2RlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQ1JMRldpdGhOZXh0Tm9kZShub2RlOiBUcmVlTm9kZSkge1xuXHRcdGlmICh0aGlzLnNob3VsZENoZWNrQ1JMRigpICYmIHRoaXMuZW5kV2l0aENSKG5vZGUpKSB7XG5cdFx0XHRjb25zdCBuZXh0Tm9kZSA9IG5vZGUubmV4dCgpO1xuXHRcdFx0aWYgKHRoaXMuc3RhcnRXaXRoTEYobmV4dE5vZGUpKSB7XG5cdFx0XHRcdHRoaXMuZml4Q1JMRihub2RlLCBuZXh0Tm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaXhDUkxGKHByZXY6IFRyZWVOb2RlLCBuZXh0OiBUcmVlTm9kZSkge1xuXHRcdGNvbnN0IG5vZGVzVG9EZWw6IFRyZWVOb2RlW10gPSBbXTtcblx0XHQvLyB1cGRhdGUgbm9kZVxuXHRcdGNvbnN0IGxpbmVTdGFydHMgPSB0aGlzLl9idWZmZXJzW3ByZXYucGllY2UuYnVmZmVySW5kZXhdLmxpbmVTdGFydHM7XG5cdFx0bGV0IG5ld0VuZDogQnVmZmVyQ3Vyc29yO1xuXHRcdGlmIChwcmV2LnBpZWNlLmVuZC5jb2x1bW4gPT09IDApIHtcblx0XHRcdC8vIGl0IG1lYW5zLCBsYXN0IGxpbmUgZW5kcyB3aXRoIFxcciwgbm90IFxcclxcblxuXHRcdFx0bmV3RW5kID0geyBsaW5lOiBwcmV2LnBpZWNlLmVuZC5saW5lIC0gMSwgY29sdW1uOiBsaW5lU3RhcnRzW3ByZXYucGllY2UuZW5kLmxpbmVdIC0gbGluZVN0YXJ0c1twcmV2LnBpZWNlLmVuZC5saW5lIC0gMV0gLSAxIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFxcclxcblxuXHRcdFx0bmV3RW5kID0geyBsaW5lOiBwcmV2LnBpZWNlLmVuZC5saW5lLCBjb2x1bW46IHByZXYucGllY2UuZW5kLmNvbHVtbiAtIDEgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2TmV3TGVuZ3RoID0gcHJldi5waWVjZS5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IHByZXZOZXdMRkNudCA9IHByZXYucGllY2UubGluZUZlZWRDbnQgLSAxO1xuXHRcdHByZXYucGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRwcmV2LnBpZWNlLmJ1ZmZlckluZGV4LFxuXHRcdFx0cHJldi5waWVjZS5zdGFydCxcblx0XHRcdG5ld0VuZCxcblx0XHRcdHByZXZOZXdMRkNudCxcblx0XHRcdHByZXZOZXdMZW5ndGhcblx0XHQpO1xuXG5cdFx0dXBkYXRlVHJlZU1ldGFkYXRhKHRoaXMsIHByZXYsIC0xLCAtMSk7XG5cdFx0aWYgKHByZXYucGllY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRub2Rlc1RvRGVsLnB1c2gocHJldik7XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIG5leHROb2RlXG5cdFx0Y29uc3QgbmV3U3RhcnQ6IEJ1ZmZlckN1cnNvciA9IHsgbGluZTogbmV4dC5waWVjZS5zdGFydC5saW5lICsgMSwgY29sdW1uOiAwIH07XG5cdFx0Y29uc3QgbmV3TGVuZ3RoID0gbmV4dC5waWVjZS5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IG5ld0xpbmVGZWVkQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChuZXh0LnBpZWNlLmJ1ZmZlckluZGV4LCBuZXdTdGFydCwgbmV4dC5waWVjZS5lbmQpO1xuXHRcdG5leHQucGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRuZXh0LnBpZWNlLmJ1ZmZlckluZGV4LFxuXHRcdFx0bmV3U3RhcnQsXG5cdFx0XHRuZXh0LnBpZWNlLmVuZCxcblx0XHRcdG5ld0xpbmVGZWVkQ250LFxuXHRcdFx0bmV3TGVuZ3RoXG5cdFx0KTtcblxuXHRcdHVwZGF0ZVRyZWVNZXRhZGF0YSh0aGlzLCBuZXh0LCAtMSwgLTEpO1xuXHRcdGlmIChuZXh0LnBpZWNlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bm9kZXNUb0RlbC5wdXNoKG5leHQpO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBuZXcgcGllY2Ugd2hpY2ggY29udGFpbnMgXFxyXFxuXG5cdFx0Y29uc3QgcGllY2VzID0gdGhpcy5jcmVhdGVOZXdQaWVjZXMoJ1xcclxcbicpO1xuXHRcdHRoaXMucmJJbnNlcnRSaWdodChwcmV2LCBwaWVjZXNbMF0pO1xuXHRcdC8vIGRlbGV0ZSBlbXB0eSBub2Rlc1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBub2Rlc1RvRGVsLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyYkRlbGV0ZSh0aGlzLCBub2Rlc1RvRGVsW2ldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkanVzdENhcnJpYWdlUmV0dXJuRnJvbU5leHQodmFsdWU6IHN0cmluZywgbm9kZTogVHJlZU5vZGUpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5zaG91bGRDaGVja0NSTEYoKSAmJiB0aGlzLmVuZFdpdGhDUih2YWx1ZSkpIHtcblx0XHRcdGNvbnN0IG5leHROb2RlID0gbm9kZS5uZXh0KCk7XG5cdFx0XHRpZiAodGhpcy5zdGFydFdpdGhMRihuZXh0Tm9kZSkpIHtcblx0XHRcdFx0Ly8gbW92ZSBgXFxuYCBmb3J3YXJkXG5cdFx0XHRcdHZhbHVlICs9ICdcXG4nO1xuXG5cdFx0XHRcdGlmIChuZXh0Tm9kZS5waWVjZS5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRyYkRlbGV0ZSh0aGlzLCBuZXh0Tm9kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cblx0XHRcdFx0XHRjb25zdCBwaWVjZSA9IG5leHROb2RlLnBpZWNlO1xuXHRcdFx0XHRcdGNvbnN0IG5ld1N0YXJ0OiBCdWZmZXJDdXJzb3IgPSB7IGxpbmU6IHBpZWNlLnN0YXJ0LmxpbmUgKyAxLCBjb2x1bW46IDAgfTtcblx0XHRcdFx0XHRjb25zdCBuZXdMZW5ndGggPSBwaWVjZS5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdGNvbnN0IG5ld0xpbmVGZWVkQ250ID0gdGhpcy5nZXRMaW5lRmVlZENudChwaWVjZS5idWZmZXJJbmRleCwgbmV3U3RhcnQsIHBpZWNlLmVuZCk7XG5cdFx0XHRcdFx0bmV4dE5vZGUucGllY2UgPSBuZXcgUGllY2UoXG5cdFx0XHRcdFx0XHRwaWVjZS5idWZmZXJJbmRleCxcblx0XHRcdFx0XHRcdG5ld1N0YXJ0LFxuXHRcdFx0XHRcdFx0cGllY2UuZW5kLFxuXHRcdFx0XHRcdFx0bmV3TGluZUZlZWRDbnQsXG5cdFx0XHRcdFx0XHRuZXdMZW5ndGhcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0dXBkYXRlVHJlZU1ldGFkYXRhKHRoaXMsIG5leHROb2RlLCAtMSwgLTEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBUcmVlIG9wZXJhdGlvbnNcblx0aXRlcmF0ZShub2RlOiBUcmVlTm9kZSwgY2FsbGJhY2s6IChub2RlOiBUcmVlTm9kZSkgPT4gYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmIChub2RlID09PSBTRU5USU5FTCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKFNFTlRJTkVMKTtcblx0XHR9XG5cblx0XHRjb25zdCBsZWZ0UmV0ID0gdGhpcy5pdGVyYXRlKG5vZGUubGVmdCwgY2FsbGJhY2spO1xuXHRcdGlmICghbGVmdFJldCkge1xuXHRcdFx0cmV0dXJuIGxlZnRSZXQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhbGxiYWNrKG5vZGUpICYmIHRoaXMuaXRlcmF0ZShub2RlLnJpZ2h0LCBjYWxsYmFjayk7XG5cdH1cblxuXHRwcml2YXRlIGdldE5vZGVDb250ZW50KG5vZGU6IFRyZWVOb2RlKSB7XG5cdFx0aWYgKG5vZGUgPT09IFNFTlRJTkVMKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2J1ZmZlcnNbbm9kZS5waWVjZS5idWZmZXJJbmRleF07XG5cdFx0Y29uc3QgcGllY2UgPSBub2RlLnBpZWNlO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgcGllY2Uuc3RhcnQpO1xuXHRcdGNvbnN0IGVuZE9mZnNldCA9IHRoaXMub2Zmc2V0SW5CdWZmZXIocGllY2UuYnVmZmVySW5kZXgsIHBpZWNlLmVuZCk7XG5cdFx0Y29uc3QgY3VycmVudENvbnRlbnQgPSBidWZmZXIuYnVmZmVyLnN1YnN0cmluZyhzdGFydE9mZnNldCwgZW5kT2Zmc2V0KTtcblx0XHRyZXR1cm4gY3VycmVudENvbnRlbnQ7XG5cdH1cblxuXHRnZXRQaWVjZUNvbnRlbnQocGllY2U6IFBpZWNlKSB7XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fYnVmZmVyc1twaWVjZS5idWZmZXJJbmRleF07XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLm9mZnNldEluQnVmZmVyKHBpZWNlLmJ1ZmZlckluZGV4LCBwaWVjZS5zdGFydCk7XG5cdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5vZmZzZXRJbkJ1ZmZlcihwaWVjZS5idWZmZXJJbmRleCwgcGllY2UuZW5kKTtcblx0XHRjb25zdCBjdXJyZW50Q29udGVudCA9IGJ1ZmZlci5idWZmZXIuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQpO1xuXHRcdHJldHVybiBjdXJyZW50Q29udGVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiAgICAgIG5vZGUgICAgICAgICAgICAgIG5vZGVcblx0ICogICAgIC8gIFxcICAgICAgICAgICAgICAvICBcXFxuXHQgKiAgICBhICAgYiAgICA8LS0tLSAgIGEgICAgYlxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAvXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgelxuXHQgKi9cblx0cHJpdmF0ZSByYkluc2VydFJpZ2h0KG5vZGU6IFRyZWVOb2RlIHwgbnVsbCwgcDogUGllY2UpOiBUcmVlTm9kZSB7XG5cdFx0Y29uc3QgeiA9IG5ldyBUcmVlTm9kZShwLCBOb2RlQ29sb3IuUmVkKTtcblx0XHR6LmxlZnQgPSBTRU5USU5FTDtcblx0XHR6LnJpZ2h0ID0gU0VOVElORUw7XG5cdFx0ei5wYXJlbnQgPSBTRU5USU5FTDtcblx0XHR6LnNpemVfbGVmdCA9IDA7XG5cdFx0ei5sZl9sZWZ0ID0gMDtcblxuXHRcdGNvbnN0IHggPSB0aGlzLnJvb3Q7XG5cdFx0aWYgKHggPT09IFNFTlRJTkVMKSB7XG5cdFx0XHR0aGlzLnJvb3QgPSB6O1xuXHRcdFx0ei5jb2xvciA9IE5vZGVDb2xvci5CbGFjaztcblx0XHR9IGVsc2UgaWYgKG5vZGUhLnJpZ2h0ID09PSBTRU5USU5FTCkge1xuXHRcdFx0bm9kZSEucmlnaHQgPSB6O1xuXHRcdFx0ei5wYXJlbnQgPSBub2RlITtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbmV4dE5vZGUgPSBsZWZ0ZXN0KG5vZGUhLnJpZ2h0KTtcblx0XHRcdG5leHROb2RlLmxlZnQgPSB6O1xuXHRcdFx0ei5wYXJlbnQgPSBuZXh0Tm9kZTtcblx0XHR9XG5cblx0XHRmaXhJbnNlcnQodGhpcywgeik7XG5cdFx0cmV0dXJuIHo7XG5cdH1cblxuXHQvKipcblx0ICogICAgICBub2RlICAgICAgICAgICAgICBub2RlXG5cdCAqICAgICAvICBcXCAgICAgICAgICAgICAgLyAgXFxcblx0ICogICAgYSAgIGIgICAgIC0tLS0+ICAgYSAgICBiXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICBcXFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgIHpcblx0ICovXG5cdHByaXZhdGUgcmJJbnNlcnRMZWZ0KG5vZGU6IFRyZWVOb2RlIHwgbnVsbCwgcDogUGllY2UpOiBUcmVlTm9kZSB7XG5cdFx0Y29uc3QgeiA9IG5ldyBUcmVlTm9kZShwLCBOb2RlQ29sb3IuUmVkKTtcblx0XHR6LmxlZnQgPSBTRU5USU5FTDtcblx0XHR6LnJpZ2h0ID0gU0VOVElORUw7XG5cdFx0ei5wYXJlbnQgPSBTRU5USU5FTDtcblx0XHR6LnNpemVfbGVmdCA9IDA7XG5cdFx0ei5sZl9sZWZ0ID0gMDtcblxuXHRcdGlmICh0aGlzLnJvb3QgPT09IFNFTlRJTkVMKSB7XG5cdFx0XHR0aGlzLnJvb3QgPSB6O1xuXHRcdFx0ei5jb2xvciA9IE5vZGVDb2xvci5CbGFjaztcblx0XHR9IGVsc2UgaWYgKG5vZGUhLmxlZnQgPT09IFNFTlRJTkVMKSB7XG5cdFx0XHRub2RlIS5sZWZ0ID0gejtcblx0XHRcdHoucGFyZW50ID0gbm9kZSE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHByZXZOb2RlID0gcmlnaHR0ZXN0KG5vZGUhLmxlZnQpOyAvLyBhXG5cdFx0XHRwcmV2Tm9kZS5yaWdodCA9IHo7XG5cdFx0XHR6LnBhcmVudCA9IHByZXZOb2RlO1xuXHRcdH1cblxuXHRcdGZpeEluc2VydCh0aGlzLCB6KTtcblx0XHRyZXR1cm4gejtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udGVudE9mU3ViVHJlZShub2RlOiBUcmVlTm9kZSk6IHN0cmluZyB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXG5cdFx0dGhpcy5pdGVyYXRlKG5vZGUsIG5vZGUgPT4ge1xuXHRcdFx0c3RyICs9IHRoaXMuZ2V0Tm9kZUNvbnRlbnQobm9kZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBzdHI7XG5cdH1cblx0Ly8gI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQTRDO0FBQ3JELFNBQVMsV0FBVyxVQUFVLFVBQVUsV0FBVyxTQUFTLFVBQVUsV0FBVywwQkFBMEI7QUFDM0csU0FBUyxVQUFVLGlCQUFpQixvQkFBb0I7QUFHeEQsTUFBTSxvQkFBb0I7QUFFMUIsU0FBUyxnQkFBZ0IsS0FBMEM7QUFDbEUsTUFBSTtBQUNKLE1BQUksSUFBSSxJQUFJLFNBQVMsQ0FBQyxJQUFJLE9BQU87QUFDaEMsUUFBSSxJQUFJLFlBQVksSUFBSSxNQUFNO0FBQUEsRUFDL0IsT0FBTztBQUNOLFFBQUksSUFBSSxZQUFZLElBQUksTUFBTTtBQUFBLEVBQy9CO0FBQ0EsSUFBRSxJQUFJLEtBQUssQ0FBQztBQUNaLFNBQU87QUFDUjtBQUVBLE1BQU0sV0FBVztBQUFBLEVBQ2hCLFlBQ2lCLFlBQ0EsSUFDQSxJQUNBLE1BQ0EsY0FDZjtBQUxlO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUNiO0FBQ0w7QUFFTyxTQUFTLHFCQUFxQixLQUFhLFdBQW9CLE1BQTRDO0FBQ2pILFFBQU0sSUFBYyxDQUFDLENBQUM7QUFDdEIsTUFBSSxVQUFVO0FBRWQsV0FBUyxJQUFJLEdBQUcsTUFBTSxJQUFJLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDL0MsVUFBTSxNQUFNLElBQUksV0FBVyxDQUFDO0FBRTVCLFFBQUksUUFBUSxTQUFTLGdCQUFnQjtBQUNwQyxVQUFJLElBQUksSUFBSSxPQUFPLElBQUksV0FBVyxJQUFJLENBQUMsTUFBTSxTQUFTLFVBQVU7QUFFL0QsVUFBRSxTQUFTLElBQUksSUFBSTtBQUNuQjtBQUFBLE1BQ0QsT0FBTztBQUVOLFVBQUUsU0FBUyxJQUFJLElBQUk7QUFBQSxNQUNwQjtBQUFBLElBQ0QsV0FBVyxRQUFRLFNBQVMsVUFBVTtBQUNyQyxRQUFFLFNBQVMsSUFBSSxJQUFJO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQ0EsTUFBSSxVQUFVO0FBQ2IsV0FBTyxnQkFBZ0IsQ0FBQztBQUFBLEVBQ3pCLE9BQU87QUFDTixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRU8sU0FBUyxpQkFBaUIsR0FBYSxLQUF5QjtBQUN0RSxJQUFFLFNBQVM7QUFDWCxJQUFFLENBQUMsSUFBSTtBQUNQLE1BQUksVUFBVTtBQUNkLE1BQUksS0FBSyxHQUFHLEtBQUssR0FBRyxPQUFPO0FBQzNCLE1BQUksZUFBZTtBQUNuQixXQUFTLElBQUksR0FBRyxNQUFNLElBQUksUUFBUSxJQUFJLEtBQUssS0FBSztBQUMvQyxVQUFNLE1BQU0sSUFBSSxXQUFXLENBQUM7QUFFNUIsUUFBSSxRQUFRLFNBQVMsZ0JBQWdCO0FBQ3BDLFVBQUksSUFBSSxJQUFJLE9BQU8sSUFBSSxXQUFXLElBQUksQ0FBQyxNQUFNLFNBQVMsVUFBVTtBQUUvRDtBQUNBLFVBQUUsU0FBUyxJQUFJLElBQUk7QUFDbkI7QUFBQSxNQUNELE9BQU87QUFDTjtBQUVBLFVBQUUsU0FBUyxJQUFJLElBQUk7QUFBQSxNQUNwQjtBQUFBLElBQ0QsV0FBVyxRQUFRLFNBQVMsVUFBVTtBQUNyQztBQUNBLFFBQUUsU0FBUyxJQUFJLElBQUk7QUFBQSxJQUNwQixPQUFPO0FBQ04sVUFBSSxjQUFjO0FBQ2pCLFlBQUksUUFBUSxTQUFTLFFBQVEsTUFBTSxNQUFNLE1BQU0sTUFBTTtBQUNwRCx5QkFBZTtBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsUUFBTSxTQUFTLElBQUksV0FBVyxnQkFBZ0IsQ0FBQyxHQUFHLElBQUksSUFBSSxNQUFNLFlBQVk7QUFDNUUsSUFBRSxTQUFTO0FBRVgsU0FBTztBQUNSO0FBNEJPLE1BQU0sTUFBTTtBQUFBLEVBT2xCLFlBQVksYUFBcUIsT0FBcUIsS0FBbUIsYUFBcUIsUUFBZ0I7QUFDN0csU0FBSyxjQUFjO0FBQ25CLFNBQUssUUFBUTtBQUNiLFNBQUssTUFBTTtBQUNYLFNBQUssY0FBYztBQUNuQixTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQ0Q7QUFFTyxNQUFNLGFBQWE7QUFBQSxFQUl6QixZQUFZLFFBQWdCLFlBQWtEO0FBQzdFLFNBQUssU0FBUztBQUNkLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQ0Q7QUFRQSxNQUFNLGtCQUEyQztBQUFBLEVBTWhELFlBQVksTUFBcUIsS0FBYTtBQUM3QyxTQUFLLFVBQVUsQ0FBQztBQUNoQixTQUFLLFFBQVE7QUFDYixTQUFLLE9BQU87QUFDWixTQUFLLFNBQVM7QUFDZCxRQUFJLEtBQUssU0FBUyxVQUFVO0FBQzNCLFdBQUssUUFBUSxLQUFLLE1BQU0sVUFBUTtBQUMvQixZQUFJLFNBQVMsVUFBVTtBQUN0QixlQUFLLFFBQVEsS0FBSyxLQUFLLEtBQUs7QUFBQSxRQUM3QjtBQUNBLGVBQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBc0I7QUFDckIsUUFBSSxLQUFLLFFBQVEsV0FBVyxHQUFHO0FBQzlCLFVBQUksS0FBSyxXQUFXLEdBQUc7QUFDdEIsYUFBSztBQUNMLGVBQU8sS0FBSztBQUFBLE1BQ2IsT0FBTztBQUNOLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxTQUFTLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDMUMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssV0FBVyxHQUFHO0FBQ3RCLGFBQU8sS0FBSyxPQUFPLEtBQUssTUFBTSxnQkFBZ0IsS0FBSyxRQUFRLEtBQUssUUFBUSxDQUFDO0FBQUEsSUFDMUU7QUFDQSxXQUFPLEtBQUssTUFBTSxnQkFBZ0IsS0FBSyxRQUFRLEtBQUssUUFBUSxDQUFDO0FBQUEsRUFDOUQ7QUFDRDtBQVFBLE1BQU0scUJBQXFCO0FBQUEsRUFJMUIsWUFBWSxPQUFlO0FBQzFCLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUyxDQUFDO0FBQUEsRUFDaEI7QUFBQSxFQUVPLElBQUksUUFBbUM7QUFDN0MsYUFBUyxJQUFJLEtBQUssT0FBTyxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDakQsWUFBTSxVQUFVLEtBQUssT0FBTyxDQUFDO0FBQzdCLFVBQUksUUFBUSxtQkFBbUIsVUFBVSxRQUFRLGtCQUFrQixRQUFRLEtBQUssTUFBTSxVQUFVLFFBQVE7QUFDdkcsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLEtBQUssWUFBcUc7QUFDaEgsYUFBUyxJQUFJLEtBQUssT0FBTyxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDakQsWUFBTSxVQUFVLEtBQUssT0FBTyxDQUFDO0FBQzdCLFVBQUksUUFBUSx1QkFBdUIsUUFBUSxzQkFBc0IsY0FBYyxRQUFRLHNCQUFzQixRQUFRLEtBQUssTUFBTSxlQUFlLFlBQVk7QUFDMUosZUFBaUY7QUFBQSxNQUNsRjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sSUFBSSxjQUEwQjtBQUNwQyxRQUFJLEtBQUssT0FBTyxVQUFVLEtBQUssUUFBUTtBQUN0QyxXQUFLLE9BQU8sTUFBTTtBQUFBLElBQ25CO0FBQ0EsU0FBSyxPQUFPLEtBQUssWUFBWTtBQUFBLEVBQzlCO0FBQUEsRUFFTyxTQUFTLFFBQWdCO0FBQy9CLFFBQUksZ0JBQWdCO0FBQ3BCLFVBQU0sTUFBZ0MsS0FBSztBQUMzQyxhQUFTLElBQUksR0FBRyxJQUFJLElBQUksUUFBUSxLQUFLO0FBQ3BDLFlBQU0sVUFBVSxJQUFJLENBQUM7QUFDckIsVUFBSSxRQUFRLEtBQUssV0FBVyxRQUFRLFFBQVEsbUJBQW1CLFFBQVE7QUFDdEUsWUFBSSxDQUFDLElBQUk7QUFDVCx3QkFBZ0I7QUFDaEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksZUFBZTtBQUNsQixZQUFNLFNBQXVCLENBQUM7QUFDOUIsaUJBQVcsU0FBUyxLQUFLO0FBQ3hCLFlBQUksVUFBVSxNQUFNO0FBQ25CLGlCQUFPLEtBQUssS0FBSztBQUFBLFFBQ2xCO0FBQUEsTUFDRDtBQUVBLFdBQUssU0FBUztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxNQUFNLGNBQWM7QUFBQSxFQVkxQixZQUFZLFFBQXdCLEtBQW9CLGVBQXdCO0FBQy9FLFNBQUssT0FBTyxRQUFRLEtBQUssYUFBYTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxPQUFPLFFBQXdCLEtBQW9CLGVBQXdCO0FBQzFFLFNBQUssV0FBVztBQUFBLE1BQ2YsSUFBSSxhQUFhLElBQUksQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUN6QjtBQUNBLFNBQUssdUJBQXVCLEVBQUUsTUFBTSxHQUFHLFFBQVEsRUFBRTtBQUNqRCxTQUFLLE9BQU87QUFDWixTQUFLLFdBQVc7QUFDaEIsU0FBSyxVQUFVO0FBQ2YsU0FBSyxPQUFPO0FBQ1osU0FBSyxhQUFhLElBQUk7QUFDdEIsU0FBSyxpQkFBaUI7QUFFdEIsUUFBSSxXQUE0QjtBQUNoQyxhQUFTLElBQUksR0FBRyxNQUFNLE9BQU8sUUFBUSxJQUFJLEtBQUssS0FBSztBQUNsRCxVQUFJLE9BQU8sQ0FBQyxFQUFFLE9BQU8sU0FBUyxHQUFHO0FBQ2hDLFlBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxZQUFZO0FBQzFCLGlCQUFPLENBQUMsRUFBRSxhQUFhLHFCQUFxQixPQUFPLENBQUMsRUFBRSxNQUFNO0FBQUEsUUFDN0Q7QUFFQSxjQUFNLFFBQVEsSUFBSTtBQUFBLFVBQ2pCLElBQUk7QUFBQSxVQUNKLEVBQUUsTUFBTSxHQUFHLFFBQVEsRUFBRTtBQUFBLFVBQ3JCLEVBQUUsTUFBTSxPQUFPLENBQUMsRUFBRSxXQUFXLFNBQVMsR0FBRyxRQUFRLE9BQU8sQ0FBQyxFQUFFLE9BQU8sU0FBUyxPQUFPLENBQUMsRUFBRSxXQUFXLE9BQU8sQ0FBQyxFQUFFLFdBQVcsU0FBUyxDQUFDLEVBQUU7QUFBQSxVQUNqSSxPQUFPLENBQUMsRUFBRSxXQUFXLFNBQVM7QUFBQSxVQUM5QixPQUFPLENBQUMsRUFBRSxPQUFPO0FBQUEsUUFDbEI7QUFDQSxhQUFLLFNBQVMsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUM1QixtQkFBVyxLQUFLLGNBQWMsVUFBVSxLQUFLO0FBQUEsTUFDOUM7QUFBQSxJQUNEO0FBRUEsU0FBSyxlQUFlLElBQUkscUJBQXFCLENBQUM7QUFDOUMsU0FBSyxtQkFBbUIsRUFBRSxZQUFZLEdBQUcsT0FBTyxHQUFHO0FBQ25ELFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVBLGFBQWEsS0FBb0I7QUFDaEMsVUFBTSxvQkFBb0I7QUFDMUIsVUFBTSxNQUFNLG9CQUFvQixLQUFLLE1BQU0sb0JBQW9CLENBQUM7QUFDaEUsVUFBTSxNQUFNLE1BQU07QUFFbEIsUUFBSSxZQUFZO0FBQ2hCLFFBQUksZUFBZTtBQUNuQixVQUFNLFNBQXlCLENBQUM7QUFFaEMsU0FBSyxRQUFRLEtBQUssTUFBTSxVQUFRO0FBQy9CLFlBQU0sTUFBTSxLQUFLLGVBQWUsSUFBSTtBQUNwQyxZQUFNLE1BQU0sSUFBSTtBQUNoQixVQUFJLGdCQUFnQixPQUFPLGVBQWUsTUFBTSxLQUFLO0FBQ3BELHFCQUFhO0FBQ2Isd0JBQWdCO0FBQ2hCLGVBQU87QUFBQSxNQUNSO0FBR0EsWUFBTSxPQUFPLFVBQVUsUUFBUSxlQUFlLEdBQUc7QUFDakQsYUFBTyxLQUFLLElBQUksYUFBYSxNQUFNLHFCQUFxQixJQUFJLENBQUMsQ0FBQztBQUM5RCxrQkFBWTtBQUNaLHFCQUFlO0FBQ2YsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFFBQUksZUFBZSxHQUFHO0FBQ3JCLFlBQU0sT0FBTyxVQUFVLFFBQVEsZUFBZSxHQUFHO0FBQ2pELGFBQU8sS0FBSyxJQUFJLGFBQWEsTUFBTSxxQkFBcUIsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUMvRDtBQUVBLFNBQUssT0FBTyxRQUFRLEtBQUssSUFBSTtBQUFBLEVBQzlCO0FBQUE7QUFBQSxFQUdPLFNBQXdCO0FBQzlCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLE9BQU8sUUFBNkI7QUFDMUMsU0FBSyxPQUFPO0FBQ1osU0FBSyxhQUFhLEtBQUssS0FBSztBQUM1QixTQUFLLGFBQWEsTUFBTTtBQUFBLEVBQ3pCO0FBQUEsRUFFTyxlQUFlLEtBQTRCO0FBQ2pELFdBQU8sSUFBSSxrQkFBa0IsTUFBTSxHQUFHO0FBQUEsRUFDdkM7QUFBQSxFQUVPLE1BQU0sT0FBK0I7QUFDM0MsUUFBSSxLQUFLLFVBQVUsTUFBTSxNQUFNLFVBQVUsR0FBRztBQUMzQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxhQUFhLE1BQU0sTUFBTSxhQUFhLEdBQUc7QUFDakQsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFNBQVM7QUFDYixVQUFNLE1BQU0sS0FBSyxRQUFRLEtBQUssTUFBTSxVQUFRO0FBQzNDLFVBQUksU0FBUyxVQUFVO0FBQ3RCLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxNQUFNLEtBQUssZUFBZSxJQUFJO0FBQ3BDLFlBQU0sTUFBTSxJQUFJO0FBQ2hCLFlBQU0sZ0JBQWdCLE1BQU0sT0FBTyxNQUFNO0FBQ3pDLFlBQU0sY0FBYyxNQUFNLE9BQU8sU0FBUyxHQUFHO0FBQzdDLFlBQU0sTUFBTSxNQUFNLGlCQUFpQixlQUFlLFdBQVc7QUFFN0QsZ0JBQVU7QUFDVixhQUFPLFFBQVE7QUFBQSxJQUNoQixDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFlBQVksWUFBb0IsUUFBd0I7QUFDOUQsUUFBSSxVQUFVO0FBRWQsUUFBSSxJQUFJLEtBQUs7QUFFYixXQUFPLE1BQU0sVUFBVTtBQUN0QixVQUFJLEVBQUUsU0FBUyxZQUFZLEVBQUUsVUFBVSxLQUFLLFlBQVk7QUFDdkQsWUFBSSxFQUFFO0FBQUEsTUFDUCxXQUFXLEVBQUUsVUFBVSxFQUFFLE1BQU0sY0FBYyxLQUFLLFlBQVk7QUFDN0QsbUJBQVcsRUFBRTtBQUViLGNBQU0sK0JBQStCLEtBQUssb0JBQW9CLEdBQUcsYUFBYSxFQUFFLFVBQVUsQ0FBQztBQUMzRixlQUFPLFdBQVcsK0JBQStCLFNBQVM7QUFBQSxNQUMzRCxPQUFPO0FBQ04sc0JBQWMsRUFBRSxVQUFVLEVBQUUsTUFBTTtBQUNsQyxtQkFBVyxFQUFFLFlBQVksRUFBRSxNQUFNO0FBQ2pDLFlBQUksRUFBRTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLGNBQWMsUUFBMEI7QUFDOUMsYUFBUyxLQUFLLE1BQU0sTUFBTTtBQUMxQixhQUFTLEtBQUssSUFBSSxHQUFHLE1BQU07QUFFM0IsUUFBSSxJQUFJLEtBQUs7QUFDYixRQUFJLFFBQVE7QUFDWixVQUFNLGlCQUFpQjtBQUV2QixXQUFPLE1BQU0sVUFBVTtBQUN0QixVQUFJLEVBQUUsY0FBYyxLQUFLLEVBQUUsYUFBYSxRQUFRO0FBQy9DLFlBQUksRUFBRTtBQUFBLE1BQ1AsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLFVBQVUsUUFBUTtBQUNsRCxjQUFNLE1BQU0sS0FBSyxXQUFXLEdBQUcsU0FBUyxFQUFFLFNBQVM7QUFFbkQsaUJBQVMsRUFBRSxVQUFVLElBQUk7QUFFekIsWUFBSSxJQUFJLFVBQVUsR0FBRztBQUNwQixnQkFBTSxrQkFBa0IsS0FBSyxZQUFZLFFBQVEsR0FBRyxDQUFDO0FBQ3JELGdCQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLGlCQUFPLElBQUksU0FBUyxRQUFRLEdBQUcsU0FBUyxDQUFDO0FBQUEsUUFDMUM7QUFFQSxlQUFPLElBQUksU0FBUyxRQUFRLEdBQUcsSUFBSSxZQUFZLENBQUM7QUFBQSxNQUNqRCxPQUFPO0FBQ04sa0JBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTTtBQUNoQyxpQkFBUyxFQUFFLFVBQVUsRUFBRSxNQUFNO0FBRTdCLFlBQUksRUFBRSxVQUFVLFVBQVU7QUFFekIsZ0JBQU0sa0JBQWtCLEtBQUssWUFBWSxRQUFRLEdBQUcsQ0FBQztBQUNyRCxnQkFBTSxTQUFTLGlCQUFpQixTQUFTO0FBQ3pDLGlCQUFPLElBQUksU0FBUyxRQUFRLEdBQUcsU0FBUyxDQUFDO0FBQUEsUUFDMUMsT0FBTztBQUNOLGNBQUksRUFBRTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLEVBQ3pCO0FBQUEsRUFFTyxnQkFBZ0IsT0FBYyxLQUFzQjtBQUMxRCxRQUFJLE1BQU0sb0JBQW9CLE1BQU0saUJBQWlCLE1BQU0sZ0JBQWdCLE1BQU0sV0FBVztBQUMzRixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sZ0JBQWdCLEtBQUssUUFBUSxNQUFNLGlCQUFpQixNQUFNLFdBQVc7QUFDM0UsVUFBTSxjQUFjLEtBQUssUUFBUSxNQUFNLGVBQWUsTUFBTSxTQUFTO0FBRXJFLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixlQUFlLFdBQVc7QUFDOUQsUUFBSSxLQUFLO0FBQ1IsVUFBSSxRQUFRLEtBQUssUUFBUSxDQUFDLEtBQUssZ0JBQWdCO0FBQzlDLGVBQU8sTUFBTSxRQUFRLGVBQWUsR0FBRztBQUFBLE1BQ3hDO0FBRUEsVUFBSSxRQUFRLEtBQUssT0FBTyxLQUFLLEtBQUssZ0JBQWdCO0FBQ2pELFlBQUksUUFBUSxRQUFRO0FBQUEsUUFFcEI7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU8sTUFBTSxRQUFRLGVBQWUsR0FBRztBQUFBLElBQ3hDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLGlCQUFpQixlQUE2QixhQUFtQztBQUN2RixRQUFJLGNBQWMsU0FBUyxZQUFZLE1BQU07QUFDNUMsWUFBTSxPQUFPLGNBQWM7QUFDM0IsWUFBTUEsVUFBUyxLQUFLLFNBQVMsS0FBSyxNQUFNLFdBQVcsRUFBRTtBQUNyRCxZQUFNQyxlQUFjLEtBQUssZUFBZSxLQUFLLE1BQU0sYUFBYSxLQUFLLE1BQU0sS0FBSztBQUNoRixhQUFPRCxRQUFPLFVBQVVDLGVBQWMsY0FBYyxXQUFXQSxlQUFjLFlBQVksU0FBUztBQUFBLElBQ25HO0FBRUEsUUFBSSxJQUFJLGNBQWM7QUFDdEIsVUFBTSxTQUFTLEtBQUssU0FBUyxFQUFFLE1BQU0sV0FBVyxFQUFFO0FBQ2xELFVBQU0sY0FBYyxLQUFLLGVBQWUsRUFBRSxNQUFNLGFBQWEsRUFBRSxNQUFNLEtBQUs7QUFDMUUsUUFBSSxNQUFNLE9BQU8sVUFBVSxjQUFjLGNBQWMsV0FBVyxjQUFjLEVBQUUsTUFBTSxNQUFNO0FBRTlGLFFBQUksRUFBRSxLQUFLO0FBQ1gsV0FBTyxNQUFNLFVBQVU7QUFDdEIsWUFBTUQsVUFBUyxLQUFLLFNBQVMsRUFBRSxNQUFNLFdBQVcsRUFBRTtBQUNsRCxZQUFNQyxlQUFjLEtBQUssZUFBZSxFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sS0FBSztBQUUxRSxVQUFJLE1BQU0sWUFBWSxNQUFNO0FBQzNCLGVBQU9ELFFBQU8sVUFBVUMsY0FBYUEsZUFBYyxZQUFZLFNBQVM7QUFDeEU7QUFBQSxNQUNELE9BQU87QUFDTixlQUFPRCxRQUFPLE9BQU9DLGNBQWEsRUFBRSxNQUFNLE1BQU07QUFBQSxNQUNqRDtBQUVBLFVBQUksRUFBRSxLQUFLO0FBQUEsSUFDWjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxrQkFBNEI7QUFDbEMsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFFBQUksY0FBYztBQUNsQixRQUFJLGNBQWM7QUFDbEIsUUFBSSxhQUFhO0FBRWpCLFNBQUssUUFBUSxLQUFLLE1BQU0sVUFBUTtBQUMvQixVQUFJLFNBQVMsVUFBVTtBQUN0QixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sUUFBUSxLQUFLO0FBQ25CLFVBQUksY0FBYyxNQUFNO0FBQ3hCLFVBQUksZ0JBQWdCLEdBQUc7QUFDdEIsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLFNBQVMsS0FBSyxTQUFTLE1BQU0sV0FBVyxFQUFFO0FBQ2hELFlBQU0sYUFBYSxLQUFLLFNBQVMsTUFBTSxXQUFXLEVBQUU7QUFFcEQsWUFBTSxpQkFBaUIsTUFBTSxNQUFNO0FBQ25DLFlBQU0sZUFBZSxNQUFNLElBQUk7QUFDL0IsVUFBSSxtQkFBbUIsV0FBVyxjQUFjLElBQUksTUFBTSxNQUFNO0FBRWhFLFVBQUksWUFBWTtBQUNmLFlBQUksT0FBTyxXQUFXLGdCQUFnQixNQUFNLFNBQVMsVUFBVTtBQUU5RDtBQUNBO0FBQUEsUUFDRDtBQUNBLGNBQU0sYUFBYSxJQUFJO0FBQ3ZCLHNCQUFjO0FBQ2QscUJBQWE7QUFDYixZQUFJLGdCQUFnQixHQUFHO0FBQ3RCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLG1CQUFtQixjQUFjO0FBRXBDLFlBQUksQ0FBQyxLQUFLLGtCQUFrQixPQUFPLFdBQVcsbUJBQW1CLGNBQWMsQ0FBQyxNQUFNLFNBQVMsZ0JBQWdCO0FBQzlHLHVCQUFhO0FBQ2IseUJBQWUsT0FBTyxPQUFPLGtCQUFrQixjQUFjLENBQUM7QUFBQSxRQUMvRCxPQUFPO0FBQ04seUJBQWUsT0FBTyxPQUFPLGtCQUFrQixXQUFXO0FBQUEsUUFDM0Q7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUdBLHFCQUNDLEtBQUssaUJBQ0YsT0FBTyxVQUFVLGtCQUFrQixLQUFLLElBQUksa0JBQWtCLFdBQVcsaUJBQWlCLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxJQUMvRyxPQUFPLFVBQVUsa0JBQWtCLFdBQVcsaUJBQWlCLENBQUMsQ0FBQyxFQUFFLFFBQVEsaUJBQWlCLEVBQUU7QUFFbEcsWUFBTSxhQUFhLElBQUk7QUFFdkIsZUFBUyxPQUFPLGlCQUFpQixHQUFHLE9BQU8sY0FBYyxRQUFRO0FBQ2hFLHNCQUNDLEtBQUssaUJBQ0YsT0FBTyxVQUFVLFdBQVcsSUFBSSxHQUFHLFdBQVcsT0FBTyxDQUFDLElBQUksS0FBSyxVQUFVLElBQ3pFLE9BQU8sVUFBVSxXQUFXLElBQUksR0FBRyxXQUFXLE9BQU8sQ0FBQyxDQUFDLEVBQUUsUUFBUSxpQkFBaUIsRUFBRTtBQUV4RixjQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3hCO0FBRUEsVUFBSSxDQUFDLEtBQUssa0JBQWtCLE9BQU8sV0FBVyxXQUFXLFlBQVksSUFBSSxNQUFNLElBQUksU0FBUyxDQUFDLE1BQU0sU0FBUyxnQkFBZ0I7QUFDM0gscUJBQWE7QUFDYixZQUFJLE1BQU0sSUFBSSxXQUFXLEdBQUc7QUFFM0I7QUFBQSxRQUNELE9BQU87QUFDTix3QkFBYyxPQUFPLE9BQU8sV0FBVyxZQUFZLEdBQUcsTUFBTSxJQUFJLFNBQVMsQ0FBQztBQUFBLFFBQzNFO0FBQUEsTUFDRCxPQUFPO0FBQ04sc0JBQWMsT0FBTyxPQUFPLFdBQVcsWUFBWSxHQUFHLE1BQU0sSUFBSSxNQUFNO0FBQUEsTUFDdkU7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsUUFBSSxZQUFZO0FBQ2YsWUFBTSxhQUFhLElBQUk7QUFDdkIsb0JBQWM7QUFBQSxJQUNmO0FBRUEsVUFBTSxhQUFhLElBQUk7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFlBQW9CO0FBQzFCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLGVBQXVCO0FBQzdCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLGVBQWUsWUFBNEI7QUFDakQsUUFBSSxLQUFLLGlCQUFpQixlQUFlLFlBQVk7QUFDcEQsYUFBTyxLQUFLLGlCQUFpQjtBQUFBLElBQzlCO0FBRUEsU0FBSyxpQkFBaUIsYUFBYTtBQUVuQyxRQUFJLGVBQWUsS0FBSyxVQUFVO0FBQ2pDLFdBQUssaUJBQWlCLFFBQVEsS0FBSyxrQkFBa0IsVUFBVTtBQUFBLElBQ2hFLFdBQVcsS0FBSyxnQkFBZ0I7QUFDL0IsV0FBSyxpQkFBaUIsUUFBUSxLQUFLLGtCQUFrQixZQUFZLEtBQUssVUFBVTtBQUFBLElBQ2pGLE9BQU87QUFDTixXQUFLLGlCQUFpQixRQUFRLEtBQUssa0JBQWtCLFVBQVUsRUFBRSxRQUFRLGlCQUFpQixFQUFFO0FBQUEsSUFDN0Y7QUFFQSxXQUFPLEtBQUssaUJBQWlCO0FBQUEsRUFDOUI7QUFBQSxFQUVRLGFBQWEsU0FBK0I7QUFDbkQsUUFBSSxRQUFRLGNBQWMsUUFBUSxLQUFLLE1BQU0sUUFBUTtBQUVwRCxZQUFNLGVBQWUsUUFBUSxLQUFLLEtBQUs7QUFDdkMsVUFBSSxDQUFDLGNBQWM7QUFDbEIsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLFNBQVMsS0FBSyxTQUFTLGFBQWEsTUFBTSxXQUFXO0FBQzNELFlBQU0sY0FBYyxLQUFLLGVBQWUsYUFBYSxNQUFNLGFBQWEsYUFBYSxNQUFNLEtBQUs7QUFDaEcsYUFBTyxPQUFPLE9BQU8sV0FBVyxXQUFXO0FBQUEsSUFDNUMsT0FBTztBQUNOLFlBQU0sU0FBUyxLQUFLLFNBQVMsUUFBUSxLQUFLLE1BQU0sV0FBVztBQUMzRCxZQUFNLGNBQWMsS0FBSyxlQUFlLFFBQVEsS0FBSyxNQUFNLGFBQWEsUUFBUSxLQUFLLE1BQU0sS0FBSztBQUNoRyxZQUFNLGVBQWUsY0FBYyxRQUFRO0FBRTNDLGFBQU8sT0FBTyxPQUFPLFdBQVcsWUFBWTtBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBLEVBRU8sZ0JBQWdCLFlBQW9CLE9BQXVCO0FBQ2pFLFVBQU0sVUFBVSxLQUFLLFFBQVEsWUFBWSxRQUFRLENBQUM7QUFDbEQsV0FBTyxLQUFLLGFBQWEsT0FBTztBQUFBLEVBQ2pDO0FBQUEsRUFFTyxjQUFjLFlBQTRCO0FBQ2hELFFBQUksZUFBZSxLQUFLLGFBQWEsR0FBRztBQUN2QyxZQUFNLGNBQWMsS0FBSyxZQUFZLFlBQVksQ0FBQztBQUNsRCxhQUFPLEtBQUssVUFBVSxJQUFJO0FBQUEsSUFDM0I7QUFDQSxXQUFPLEtBQUssWUFBWSxhQUFhLEdBQUcsQ0FBQyxJQUFJLEtBQUssWUFBWSxZQUFZLENBQUMsSUFBSSxLQUFLO0FBQUEsRUFDckY7QUFBQSxFQUVPLFlBQVksUUFBd0I7QUFDMUMsVUFBTSxVQUFVLEtBQUssT0FBTyxNQUFNO0FBQ2xDLFdBQU8sS0FBSyxhQUFhLE9BQU87QUFBQSxFQUNqQztBQUFBLEVBRU8sZ0JBQWdCLFFBQXdCO0FBQzlDLFVBQU0sVUFBVSxLQUFLLE9BQU8sTUFBTTtBQUNsQyxRQUFJLFFBQVEsY0FBYyxRQUFRLEtBQUssTUFBTSxRQUFRO0FBRXBELFlBQU0sZUFBZSxRQUFRLEtBQUssS0FBSztBQUN2QyxVQUFJLENBQUMsZ0JBQWdCLGlCQUFpQixVQUFVO0FBQy9DLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxTQUFTLEtBQUssU0FBUyxhQUFhLE1BQU0sV0FBVztBQUMzRCxZQUFNLGNBQWMsS0FBSyxlQUFlLGFBQWEsTUFBTSxhQUFhLGFBQWEsTUFBTSxLQUFLO0FBQ2hHLGFBQU8sT0FBTyxPQUFPLFVBQVUsYUFBYSxjQUFjLGFBQWEsTUFBTSxNQUFNO0FBQUEsSUFDcEYsT0FBTztBQUNOLFlBQU0sU0FBUyxLQUFLLFNBQVMsUUFBUSxLQUFLLE1BQU0sV0FBVztBQUMzRCxZQUFNLGNBQWMsS0FBSyxlQUFlLFFBQVEsS0FBSyxNQUFNLGFBQWEsUUFBUSxLQUFLLE1BQU0sS0FBSztBQUNoRyxZQUFNLGVBQWUsY0FBYyxRQUFRO0FBQzNDLFlBQU0sWUFBWSxjQUFjLFFBQVEsS0FBSyxNQUFNO0FBQ25ELGFBQU8sT0FBTyxPQUFPLFVBQVUsY0FBYyxTQUFTO0FBQUEsSUFDdkQ7QUFBQSxFQUNEO0FBQUEsRUFFTyxrQkFBa0IsTUFBZ0IsVUFBb0IsaUJBQXlCLGFBQXFCLGFBQTJCLFdBQXlCLFlBQXdCLGdCQUF5QixrQkFBMEIsV0FBbUIsUUFBcUI7QUFDalIsVUFBTSxTQUFTLEtBQUssU0FBUyxLQUFLLE1BQU0sV0FBVztBQUNuRCxVQUFNLHNCQUFzQixLQUFLLGVBQWUsS0FBSyxNQUFNLGFBQWEsS0FBSyxNQUFNLEtBQUs7QUFDeEYsVUFBTSxRQUFRLEtBQUssZUFBZSxLQUFLLE1BQU0sYUFBYSxXQUFXO0FBQ3JFLFVBQU0sTUFBTSxLQUFLLGVBQWUsS0FBSyxNQUFNLGFBQWEsU0FBUztBQUVqRSxRQUFJO0FBRUosVUFBTSxNQUFvQixFQUFFLE1BQU0sR0FBRyxRQUFRLEVBQUU7QUFDL0MsUUFBSTtBQUNKLFFBQUk7QUFFSixRQUFJLFNBQVMsaUJBQWlCO0FBQzdCLG1CQUFhLE9BQU8sT0FBTyxVQUFVLE9BQU8sR0FBRztBQUMvQyx1QkFBaUIsQ0FBQyxXQUFtQixTQUFTO0FBQzlDLGVBQVMsTUFBTSxDQUFDO0FBQUEsSUFDakIsT0FBTztBQUNOLG1CQUFhLE9BQU87QUFDcEIsdUJBQWlCLENBQUMsV0FBbUI7QUFDckMsZUFBUyxNQUFNLEtBQUs7QUFBQSxJQUNyQjtBQUVBLE9BQUc7QUFDRixVQUFJLFNBQVMsS0FBSyxVQUFVO0FBRTVCLFVBQUksR0FBRztBQUNOLFlBQUksZUFBZSxFQUFFLEtBQUssS0FBSyxLQUFLO0FBQ25DLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGFBQUssaUJBQWlCLE1BQU0sZUFBZSxFQUFFLEtBQUssSUFBSSxxQkFBcUIsR0FBRztBQUM5RSxjQUFNLGNBQWMsS0FBSyxlQUFlLEtBQUssTUFBTSxhQUFhLGFBQWEsR0FBRztBQUNoRixjQUFNLGlCQUFpQixJQUFJLFNBQVMsWUFBWSxPQUFPLElBQUksU0FBUyxZQUFZLFNBQVMsY0FBYyxJQUFJLFNBQVM7QUFDcEgsY0FBTSxlQUFlLGlCQUFpQixFQUFFLENBQUMsRUFBRTtBQUMzQyxlQUFPLFdBQVcsSUFBSSxnQkFBZ0IsSUFBSSxNQUFNLGtCQUFrQixhQUFhLGdCQUFnQixrQkFBa0IsYUFBYSxZQUFZLEdBQUcsR0FBRyxjQUFjO0FBRTlKLFlBQUksZUFBZSxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEtBQUs7QUFDakQsaUJBQU87QUFBQSxRQUNSO0FBQ0EsWUFBSSxhQUFhLGtCQUFrQjtBQUNsQyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFFRCxTQUFTO0FBRVQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLHNCQUFzQixhQUFvQixZQUF3QixnQkFBeUIsa0JBQXVDO0FBQ3hJLFVBQU0sU0FBc0IsQ0FBQztBQUM3QixRQUFJLFlBQVk7QUFDaEIsVUFBTSxXQUFXLElBQUksU0FBUyxXQUFXLGdCQUFnQixXQUFXLEtBQUs7QUFFekUsUUFBSSxnQkFBZ0IsS0FBSyxRQUFRLFlBQVksaUJBQWlCLFlBQVksV0FBVztBQUNyRixRQUFJLGtCQUFrQixNQUFNO0FBQzNCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxVQUFNLGNBQWMsS0FBSyxRQUFRLFlBQVksZUFBZSxZQUFZLFNBQVM7QUFDakYsUUFBSSxnQkFBZ0IsTUFBTTtBQUN6QixhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsUUFBSSxRQUFRLEtBQUssaUJBQWlCLGNBQWMsTUFBTSxjQUFjLFNBQVM7QUFDN0UsVUFBTSxNQUFNLEtBQUssaUJBQWlCLFlBQVksTUFBTSxZQUFZLFNBQVM7QUFFekUsUUFBSSxjQUFjLFNBQVMsWUFBWSxNQUFNO0FBQzVDLFdBQUssa0JBQWtCLGNBQWMsTUFBTSxVQUFVLFlBQVksaUJBQWlCLFlBQVksYUFBYSxPQUFPLEtBQUssWUFBWSxnQkFBZ0Isa0JBQWtCLFdBQVcsTUFBTTtBQUN0TCxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksa0JBQWtCLFlBQVk7QUFFbEMsUUFBSSxjQUFjLGNBQWM7QUFDaEMsV0FBTyxnQkFBZ0IsWUFBWSxNQUFNO0FBQ3hDLFlBQU0sZUFBZSxLQUFLLGVBQWUsWUFBWSxNQUFNLGFBQWEsT0FBTyxZQUFZLE1BQU0sR0FBRztBQUVwRyxVQUFJLGdCQUFnQixHQUFHO0FBRXRCLGNBQU0sYUFBYSxLQUFLLFNBQVMsWUFBWSxNQUFNLFdBQVcsRUFBRTtBQUNoRSxjQUFNLHNCQUFzQixLQUFLLGVBQWUsWUFBWSxNQUFNLGFBQWEsWUFBWSxNQUFNLEtBQUs7QUFDdEcsY0FBTSxzQkFBc0IsV0FBVyxNQUFNLE9BQU8sWUFBWTtBQUNoRSxjQUFNQyxlQUFjLG9CQUFvQixZQUFZLGtCQUFrQixZQUFZLGNBQWM7QUFDaEcsb0JBQVksS0FBSyxrQkFBa0IsYUFBYSxVQUFVLGlCQUFpQkEsY0FBYSxPQUFPLEtBQUssaUJBQWlCLGFBQWEsc0JBQXNCLG1CQUFtQixHQUFHLFlBQVksZ0JBQWdCLGtCQUFrQixXQUFXLE1BQU07QUFFN08sWUFBSSxhQUFhLGtCQUFrQjtBQUNsQyxpQkFBTztBQUFBLFFBQ1I7QUFFQSwyQkFBbUI7QUFBQSxNQUNwQjtBQUVBLFlBQU1BLGVBQWMsb0JBQW9CLFlBQVksa0JBQWtCLFlBQVksY0FBYyxJQUFJO0FBRXBHLFVBQUksb0JBQW9CLFlBQVksZUFBZTtBQUNsRCxjQUFNLE9BQU8sS0FBSyxlQUFlLGVBQWUsRUFBRSxVQUFVQSxjQUFhLFlBQVksWUFBWSxDQUFDO0FBQ2xHLG9CQUFZLEtBQUssbUJBQW1CLFlBQVksVUFBVSxNQUFNLFlBQVksZUFBZUEsY0FBYSxXQUFXLFFBQVEsZ0JBQWdCLGdCQUFnQjtBQUMzSixlQUFPO0FBQUEsTUFDUjtBQUVBLGtCQUFZLEtBQUssbUJBQW1CLFlBQVksVUFBVSxLQUFLLGVBQWUsZUFBZSxFQUFFLE9BQU9BLFlBQVcsR0FBRyxpQkFBaUJBLGNBQWEsV0FBVyxRQUFRLGdCQUFnQixnQkFBZ0I7QUFFck0sVUFBSSxhQUFhLGtCQUFrQjtBQUNsQyxlQUFPO0FBQUEsTUFDUjtBQUVBO0FBQ0Esc0JBQWdCLEtBQUssUUFBUSxpQkFBaUIsQ0FBQztBQUMvQyxvQkFBYyxjQUFjO0FBQzVCLGNBQVEsS0FBSyxpQkFBaUIsY0FBYyxNQUFNLGNBQWMsU0FBUztBQUFBLElBQzFFO0FBRUEsUUFBSSxvQkFBb0IsWUFBWSxlQUFlO0FBQ2xELFlBQU1BLGVBQWMsb0JBQW9CLFlBQVksa0JBQWtCLFlBQVksY0FBYyxJQUFJO0FBQ3BHLFlBQU0sT0FBTyxLQUFLLGVBQWUsZUFBZSxFQUFFLFVBQVVBLGNBQWEsWUFBWSxZQUFZLENBQUM7QUFDbEcsa0JBQVksS0FBSyxtQkFBbUIsWUFBWSxVQUFVLE1BQU0sWUFBWSxlQUFlQSxjQUFhLFdBQVcsUUFBUSxnQkFBZ0IsZ0JBQWdCO0FBQzNKLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxjQUFjLG9CQUFvQixZQUFZLGtCQUFrQixZQUFZLGNBQWM7QUFDaEcsZ0JBQVksS0FBSyxrQkFBa0IsWUFBWSxNQUFNLFVBQVUsaUJBQWlCLGFBQWEsT0FBTyxLQUFLLFlBQVksZ0JBQWdCLGtCQUFrQixXQUFXLE1BQU07QUFDeEssV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG1CQUFtQixZQUF3QixVQUFvQixNQUFjLFlBQW9CLGFBQXFCLFdBQW1CLFFBQXFCLGdCQUF5QixrQkFBa0M7QUFDaE8sVUFBTSxpQkFBaUIsV0FBVztBQUNsQyxRQUFJLENBQUMsa0JBQWtCLFdBQVcsY0FBYztBQUMvQyxZQUFNLGVBQWUsV0FBVztBQUNoQyxZQUFNLGtCQUFrQixhQUFhO0FBQ3JDLFlBQU0sYUFBYSxLQUFLO0FBRXhCLFVBQUksaUJBQWlCLENBQUM7QUFDdEIsY0FBUSxpQkFBaUIsS0FBSyxRQUFRLGNBQWMsaUJBQWlCLGVBQWUsT0FBTyxJQUFJO0FBQzlGLFlBQUksQ0FBQyxrQkFBa0IsYUFBYSxnQkFBZ0IsTUFBTSxZQUFZLGdCQUFnQixlQUFlLEdBQUc7QUFDdkcsaUJBQU8sV0FBVyxJQUFJLElBQUksVUFBVSxJQUFJLE1BQU0sWUFBWSxpQkFBaUIsSUFBSSxhQUFhLFlBQVksaUJBQWlCLElBQUksa0JBQWtCLFdBQVcsR0FBRyxJQUFJO0FBQ2pLLGNBQUksYUFBYSxrQkFBa0I7QUFDbEMsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFFSixhQUFTLE1BQU0sQ0FBQztBQUNoQixPQUFHO0FBQ0YsVUFBSSxTQUFTLEtBQUssSUFBSTtBQUN0QixVQUFJLEdBQUc7QUFDTixlQUFPLFdBQVcsSUFBSSxnQkFBZ0IsSUFBSSxNQUFNLFlBQVksRUFBRSxRQUFRLElBQUksYUFBYSxZQUFZLEVBQUUsUUFBUSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFNBQVMsV0FBVyxHQUFHLEdBQUcsY0FBYztBQUM5SixZQUFJLGFBQWEsa0JBQWtCO0FBQ2xDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNELFNBQVM7QUFDVCxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQSxFQUtPLE9BQU8sUUFBZ0IsT0FBZSxnQkFBeUIsT0FBYTtBQUNsRixTQUFLLGlCQUFpQixLQUFLLGtCQUFrQjtBQUM3QyxTQUFLLGlCQUFpQixhQUFhO0FBQ25DLFNBQUssaUJBQWlCLFFBQVE7QUFFOUIsUUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMzQixZQUFNLEVBQUUsTUFBTSxXQUFXLGdCQUFnQixJQUFJLEtBQUssT0FBTyxNQUFNO0FBQy9ELFlBQU0sUUFBUSxLQUFLO0FBQ25CLFlBQU0sY0FBYyxNQUFNO0FBQzFCLFlBQU0sb0JBQW9CLEtBQUssaUJBQWlCLE1BQU0sU0FBUztBQUMvRCxVQUFJLEtBQUssTUFBTSxnQkFBZ0IsS0FDOUIsTUFBTSxJQUFJLFNBQVMsS0FBSyxxQkFBcUIsUUFDN0MsTUFBTSxJQUFJLFdBQVcsS0FBSyxxQkFBcUIsVUFDOUMsa0JBQWtCLE1BQU0sV0FBVyxVQUNwQyxNQUFNLFNBQVMsbUJBQ2Q7QUFFRCxhQUFLLGFBQWEsTUFBTSxLQUFLO0FBQzdCLGFBQUssc0JBQXNCO0FBQzNCO0FBQUEsTUFDRDtBQUVBLFVBQUksb0JBQW9CLFFBQVE7QUFDL0IsYUFBSyx3QkFBd0IsT0FBTyxJQUFJO0FBQ3hDLGFBQUssYUFBYSxTQUFTLE1BQU07QUFBQSxNQUNsQyxXQUFXLGtCQUFrQixLQUFLLE1BQU0sU0FBUyxRQUFRO0FBRXhELGNBQU0sYUFBeUIsQ0FBQztBQUNoQyxZQUFJLGdCQUFnQixJQUFJO0FBQUEsVUFDdkIsTUFBTTtBQUFBLFVBQ047QUFBQSxVQUNBLE1BQU07QUFBQSxVQUNOLEtBQUssZUFBZSxNQUFNLGFBQWEsbUJBQW1CLE1BQU0sR0FBRztBQUFBLFVBQ25FLEtBQUssZUFBZSxhQUFhLE1BQU0sR0FBRyxJQUFJLEtBQUssZUFBZSxhQUFhLGlCQUFpQjtBQUFBLFFBQ2pHO0FBRUEsWUFBSSxLQUFLLGdCQUFnQixLQUFLLEtBQUssVUFBVSxLQUFLLEdBQUc7QUFDcEQsZ0JBQU0sY0FBYyxLQUFLLGVBQWUsTUFBTSxTQUFTO0FBRXZELGNBQUksZ0JBQWdCLElBQWM7QUFDakMsa0JBQU0sV0FBeUIsRUFBRSxNQUFNLGNBQWMsTUFBTSxPQUFPLEdBQUcsUUFBUSxFQUFFO0FBQy9FLDRCQUFnQixJQUFJO0FBQUEsY0FDbkIsY0FBYztBQUFBLGNBQ2Q7QUFBQSxjQUNBLGNBQWM7QUFBQSxjQUNkLEtBQUssZUFBZSxjQUFjLGFBQWEsVUFBVSxjQUFjLEdBQUc7QUFBQSxjQUMxRSxjQUFjLFNBQVM7QUFBQSxZQUN4QjtBQUVBLHFCQUFTO0FBQUEsVUFDVjtBQUFBLFFBQ0Q7QUFHQSxZQUFJLEtBQUssZ0JBQWdCLEtBQUssS0FBSyxZQUFZLEtBQUssR0FBRztBQUN0RCxnQkFBTSxhQUFhLEtBQUssZUFBZSxNQUFNLFlBQVksQ0FBQztBQUMxRCxjQUFJLGVBQWUsSUFBYztBQUNoQyxrQkFBTSxjQUFjLEtBQUssaUJBQWlCLE1BQU0sWUFBWSxDQUFDO0FBQzdELGlCQUFLLGVBQWUsTUFBTSxXQUFXO0FBQ3JDLG9CQUFRLE9BQU87QUFFZixnQkFBSSxLQUFLLE1BQU0sV0FBVyxHQUFHO0FBQzVCLHlCQUFXLEtBQUssSUFBSTtBQUFBLFlBQ3JCO0FBQUEsVUFDRCxPQUFPO0FBQ04saUJBQUssZUFBZSxNQUFNLGlCQUFpQjtBQUFBLFVBQzVDO0FBQUEsUUFDRCxPQUFPO0FBQ04sZUFBSyxlQUFlLE1BQU0saUJBQWlCO0FBQUEsUUFDNUM7QUFFQSxjQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUM1QyxZQUFJLGNBQWMsU0FBUyxHQUFHO0FBQzdCLGVBQUssY0FBYyxNQUFNLGFBQWE7QUFBQSxRQUN2QztBQUVBLFlBQUksVUFBVTtBQUNkLGlCQUFTLElBQUksR0FBRyxJQUFJLFVBQVUsUUFBUSxLQUFLO0FBQzFDLG9CQUFVLEtBQUssY0FBYyxTQUFTLFVBQVUsQ0FBQyxDQUFDO0FBQUEsUUFDbkQ7QUFDQSxhQUFLLFlBQVksVUFBVTtBQUFBLE1BQzVCLE9BQU87QUFDTixhQUFLLHlCQUF5QixPQUFPLElBQUk7QUFBQSxNQUMxQztBQUFBLElBQ0QsT0FBTztBQUVOLFlBQU0sU0FBUyxLQUFLLGdCQUFnQixLQUFLO0FBQ3pDLFVBQUksT0FBTyxLQUFLLGFBQWEsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUU1QyxlQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sUUFBUSxLQUFLO0FBQ3ZDLGVBQU8sS0FBSyxjQUFjLE1BQU0sT0FBTyxDQUFDLENBQUM7QUFBQSxNQUMxQztBQUFBLElBQ0Q7QUFHQSxTQUFLLHNCQUFzQjtBQUFBLEVBQzVCO0FBQUEsRUFFTyxPQUFPLFFBQWdCLEtBQW1CO0FBQ2hELFNBQUssaUJBQWlCLGFBQWE7QUFDbkMsU0FBSyxpQkFBaUIsUUFBUTtBQUU5QixRQUFJLE9BQU8sS0FBSyxLQUFLLFNBQVMsVUFBVTtBQUN2QztBQUFBLElBQ0Q7QUFFQSxVQUFNLGdCQUFnQixLQUFLLE9BQU8sTUFBTTtBQUN4QyxVQUFNLGNBQWMsS0FBSyxPQUFPLFNBQVMsR0FBRztBQUM1QyxVQUFNLFlBQVksY0FBYztBQUNoQyxVQUFNLFVBQVUsWUFBWTtBQUU1QixRQUFJLGNBQWMsU0FBUztBQUMxQixZQUFNQyx5QkFBd0IsS0FBSyxpQkFBaUIsV0FBVyxjQUFjLFNBQVM7QUFDdEYsWUFBTUMsdUJBQXNCLEtBQUssaUJBQWlCLFdBQVcsWUFBWSxTQUFTO0FBRWxGLFVBQUksY0FBYyxvQkFBb0IsUUFBUTtBQUM3QyxZQUFJLFFBQVEsVUFBVSxNQUFNLFFBQVE7QUFDbkMsZ0JBQU0sT0FBTyxVQUFVLEtBQUs7QUFDNUIsbUJBQVMsTUFBTSxTQUFTO0FBQ3hCLGVBQUsseUJBQXlCLElBQUk7QUFDbEMsZUFBSyxzQkFBc0I7QUFDM0I7QUFBQSxRQUNEO0FBQ0EsYUFBSyxlQUFlLFdBQVdBLG9CQUFtQjtBQUNsRCxhQUFLLGFBQWEsU0FBUyxNQUFNO0FBQ2pDLGFBQUsseUJBQXlCLFNBQVM7QUFDdkMsYUFBSyxzQkFBc0I7QUFDM0I7QUFBQSxNQUNEO0FBRUEsVUFBSSxjQUFjLGtCQUFrQixVQUFVLE1BQU0sV0FBVyxTQUFTLEtBQUs7QUFDNUUsYUFBSyxlQUFlLFdBQVdELHNCQUFxQjtBQUNwRCxhQUFLLHlCQUF5QixTQUFTO0FBQ3ZDLGFBQUssc0JBQXNCO0FBQzNCO0FBQUEsTUFDRDtBQUdBLFdBQUssV0FBVyxXQUFXQSx3QkFBdUJDLG9CQUFtQjtBQUNyRSxXQUFLLHNCQUFzQjtBQUMzQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQXlCLENBQUM7QUFFaEMsVUFBTSx3QkFBd0IsS0FBSyxpQkFBaUIsV0FBVyxjQUFjLFNBQVM7QUFDdEYsU0FBSyxlQUFlLFdBQVcscUJBQXFCO0FBQ3BELFNBQUssYUFBYSxTQUFTLE1BQU07QUFDakMsUUFBSSxVQUFVLE1BQU0sV0FBVyxHQUFHO0FBQ2pDLGlCQUFXLEtBQUssU0FBUztBQUFBLElBQzFCO0FBR0EsVUFBTSxzQkFBc0IsS0FBSyxpQkFBaUIsU0FBUyxZQUFZLFNBQVM7QUFDaEYsU0FBSyxlQUFlLFNBQVMsbUJBQW1CO0FBQ2hELFFBQUksUUFBUSxNQUFNLFdBQVcsR0FBRztBQUMvQixpQkFBVyxLQUFLLE9BQU87QUFBQSxJQUN4QjtBQUdBLFVBQU0sYUFBYSxVQUFVLEtBQUs7QUFDbEMsYUFBUyxPQUFPLFlBQVksU0FBUyxZQUFZLFNBQVMsU0FBUyxPQUFPLEtBQUssS0FBSyxHQUFHO0FBQ3RGLGlCQUFXLEtBQUssSUFBSTtBQUFBLElBQ3JCO0FBRUEsVUFBTSxPQUFPLFVBQVUsTUFBTSxXQUFXLElBQUksVUFBVSxLQUFLLElBQUk7QUFDL0QsU0FBSyxZQUFZLFVBQVU7QUFDM0IsU0FBSyx5QkFBeUIsSUFBSTtBQUNsQyxTQUFLLHNCQUFzQjtBQUFBLEVBQzVCO0FBQUEsRUFFUSx3QkFBd0IsT0FBZSxNQUFnQjtBQUU5RCxVQUFNLGFBQXlCLENBQUM7QUFDaEMsUUFBSSxLQUFLLGdCQUFnQixLQUFLLEtBQUssVUFBVSxLQUFLLEtBQUssS0FBSyxZQUFZLElBQUksR0FBRztBQUc5RSxZQUFNLFFBQVEsS0FBSztBQUNuQixZQUFNLFdBQXlCLEVBQUUsTUFBTSxNQUFNLE1BQU0sT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUN2RSxZQUFNLFNBQVMsSUFBSTtBQUFBLFFBQ2xCLE1BQU07QUFBQSxRQUNOO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixLQUFLLGVBQWUsTUFBTSxhQUFhLFVBQVUsTUFBTSxHQUFHO0FBQUEsUUFDMUQsTUFBTSxTQUFTO0FBQUEsTUFDaEI7QUFFQSxXQUFLLFFBQVE7QUFFYixlQUFTO0FBQ1QseUJBQW1CLE1BQU0sTUFBTSxJQUFJLEVBQUU7QUFFckMsVUFBSSxLQUFLLE1BQU0sV0FBVyxHQUFHO0FBQzVCLG1CQUFXLEtBQUssSUFBSTtBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSxLQUFLLGdCQUFnQixLQUFLO0FBQzVDLFFBQUksVUFBVSxLQUFLLGFBQWEsTUFBTSxVQUFVLFVBQVUsU0FBUyxDQUFDLENBQUM7QUFDckUsYUFBUyxJQUFJLFVBQVUsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQy9DLGdCQUFVLEtBQUssYUFBYSxTQUFTLFVBQVUsQ0FBQyxDQUFDO0FBQUEsSUFDbEQ7QUFDQSxTQUFLLHlCQUF5QixPQUFPO0FBQ3JDLFNBQUssWUFBWSxVQUFVO0FBQUEsRUFDNUI7QUFBQSxFQUVRLHlCQUF5QixPQUFlLE1BQWdCO0FBRS9ELFFBQUksS0FBSyw2QkFBNkIsT0FBTyxJQUFJLEdBQUc7QUFFbkQsZUFBUztBQUFBLElBQ1Y7QUFFQSxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUM1QyxVQUFNLFVBQVUsS0FBSyxjQUFjLE1BQU0sVUFBVSxDQUFDLENBQUM7QUFDckQsUUFBSSxVQUFVO0FBRWQsYUFBUyxJQUFJLEdBQUcsSUFBSSxVQUFVLFFBQVEsS0FBSztBQUMxQyxnQkFBVSxLQUFLLGNBQWMsU0FBUyxVQUFVLENBQUMsQ0FBQztBQUFBLElBQ25EO0FBRUEsU0FBSyx5QkFBeUIsT0FBTztBQUFBLEVBQ3RDO0FBQUEsRUFJUSxpQkFBaUIsTUFBZ0IsV0FBbUIsS0FBeUM7QUFDcEcsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxjQUFjLEtBQUssTUFBTTtBQUMvQixVQUFNLGFBQWEsS0FBSyxTQUFTLFdBQVcsRUFBRTtBQUU5QyxVQUFNLGNBQWMsV0FBVyxNQUFNLE1BQU0sSUFBSSxJQUFJLE1BQU0sTUFBTTtBQUUvRCxVQUFNLFNBQVMsY0FBYztBQUc3QixRQUFJLE1BQU0sTUFBTSxNQUFNO0FBQ3RCLFFBQUksT0FBTyxNQUFNLElBQUk7QUFFckIsUUFBSSxNQUFjO0FBQ2xCLFFBQUksVUFBa0I7QUFDdEIsUUFBSSxXQUFtQjtBQUV2QixXQUFPLE9BQU8sTUFBTTtBQUNuQixZQUFNLE9BQVEsT0FBTyxPQUFPLElBQUs7QUFDakMsaUJBQVcsV0FBVyxHQUFHO0FBRXpCLFVBQUksUUFBUSxNQUFNO0FBQ2pCO0FBQUEsTUFDRDtBQUVBLGdCQUFVLFdBQVcsTUFBTSxDQUFDO0FBRTVCLFVBQUksU0FBUyxVQUFVO0FBQ3RCLGVBQU8sTUFBTTtBQUFBLE1BQ2QsV0FBVyxVQUFVLFNBQVM7QUFDN0IsY0FBTSxNQUFNO0FBQUEsTUFDYixPQUFPO0FBQ047QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSztBQUNSLFVBQUksT0FBTztBQUNYLFVBQUksU0FBUyxTQUFTO0FBQ3RCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sUUFBUSxTQUFTO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLGFBQXFCLE9BQXFCLEtBQTJCO0FBRzNGLFFBQUksSUFBSSxXQUFXLEdBQUc7QUFDckIsYUFBTyxJQUFJLE9BQU8sTUFBTTtBQUFBLElBQ3pCO0FBRUEsVUFBTSxhQUFhLEtBQUssU0FBUyxXQUFXLEVBQUU7QUFDOUMsUUFBSSxJQUFJLFNBQVMsV0FBVyxTQUFTLEdBQUc7QUFDdkMsYUFBTyxJQUFJLE9BQU8sTUFBTTtBQUFBLElBQ3pCO0FBRUEsVUFBTSxzQkFBc0IsV0FBVyxJQUFJLE9BQU8sQ0FBQztBQUNuRCxVQUFNLFlBQVksV0FBVyxJQUFJLElBQUksSUFBSSxJQUFJO0FBQzdDLFFBQUksc0JBQXNCLFlBQVksR0FBRztBQUN4QyxhQUFPLElBQUksT0FBTyxNQUFNO0FBQUEsSUFDekI7QUFJQSxVQUFNLHFCQUFxQixZQUFZO0FBQ3ZDLFVBQU0sU0FBUyxLQUFLLFNBQVMsV0FBVyxFQUFFO0FBRTFDLFFBQUksT0FBTyxXQUFXLGtCQUFrQixNQUFNLElBQUk7QUFDakQsYUFBTyxJQUFJLE9BQU8sTUFBTSxPQUFPO0FBQUEsSUFDaEMsT0FBTztBQUNOLGFBQU8sSUFBSSxPQUFPLE1BQU07QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsYUFBcUIsUUFBOEI7QUFDekUsVUFBTSxhQUFhLEtBQUssU0FBUyxXQUFXLEVBQUU7QUFDOUMsV0FBTyxXQUFXLE9BQU8sSUFBSSxJQUFJLE9BQU87QUFBQSxFQUN6QztBQUFBLEVBRVEsWUFBWSxPQUF5QjtBQUM1QyxhQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3RDLGVBQVMsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLE1BQXVCO0FBQzlDLFFBQUksS0FBSyxTQUFTLG1CQUFtQjtBQUdwQyxZQUFNLFlBQXFCLENBQUM7QUFDNUIsYUFBTyxLQUFLLFNBQVMsbUJBQW1CO0FBQ3ZDLGNBQU0sV0FBVyxLQUFLLFdBQVcsb0JBQW9CLENBQUM7QUFDdEQsWUFBSTtBQUNKLFlBQUksYUFBYSxTQUFTLGtCQUFtQixZQUFZLFNBQVUsWUFBWSxPQUFTO0FBRXZGLHNCQUFZLEtBQUssVUFBVSxHQUFHLG9CQUFvQixDQUFDO0FBQ25ELGlCQUFPLEtBQUssVUFBVSxvQkFBb0IsQ0FBQztBQUFBLFFBQzVDLE9BQU87QUFDTixzQkFBWSxLQUFLLFVBQVUsR0FBRyxpQkFBaUI7QUFDL0MsaUJBQU8sS0FBSyxVQUFVLGlCQUFpQjtBQUFBLFFBQ3hDO0FBRUEsY0FBTUMsY0FBYSxxQkFBcUIsU0FBUztBQUNqRCxrQkFBVSxLQUFLLElBQUk7QUFBQSxVQUNsQixLQUFLLFNBQVM7QUFBQTtBQUFBLFVBQ2QsRUFBRSxNQUFNLEdBQUcsUUFBUSxFQUFFO0FBQUEsVUFDckIsRUFBRSxNQUFNQSxZQUFXLFNBQVMsR0FBRyxRQUFRLFVBQVUsU0FBU0EsWUFBV0EsWUFBVyxTQUFTLENBQUMsRUFBRTtBQUFBLFVBQzVGQSxZQUFXLFNBQVM7QUFBQSxVQUNwQixVQUFVO0FBQUEsUUFDWCxDQUFDO0FBQ0QsYUFBSyxTQUFTLEtBQUssSUFBSSxhQUFhLFdBQVdBLFdBQVUsQ0FBQztBQUFBLE1BQzNEO0FBRUEsWUFBTUEsY0FBYSxxQkFBcUIsSUFBSTtBQUM1QyxnQkFBVSxLQUFLLElBQUk7QUFBQSxRQUNsQixLQUFLLFNBQVM7QUFBQTtBQUFBLFFBQ2QsRUFBRSxNQUFNLEdBQUcsUUFBUSxFQUFFO0FBQUEsUUFDckIsRUFBRSxNQUFNQSxZQUFXLFNBQVMsR0FBRyxRQUFRLEtBQUssU0FBU0EsWUFBV0EsWUFBVyxTQUFTLENBQUMsRUFBRTtBQUFBLFFBQ3ZGQSxZQUFXLFNBQVM7QUFBQSxRQUNwQixLQUFLO0FBQUEsTUFDTixDQUFDO0FBQ0QsV0FBSyxTQUFTLEtBQUssSUFBSSxhQUFhLE1BQU1BLFdBQVUsQ0FBQztBQUVyRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksY0FBYyxLQUFLLFNBQVMsQ0FBQyxFQUFFLE9BQU87QUFDMUMsVUFBTSxhQUFhLHFCQUFxQixNQUFNLEtBQUs7QUFFbkQsUUFBSSxRQUFRLEtBQUs7QUFDakIsUUFBSSxLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVcsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFXLFNBQVMsQ0FBQyxNQUFNLGVBQ3hFLGdCQUFnQixLQUNoQixLQUFLLFlBQVksSUFBSSxLQUNyQixLQUFLLFVBQVUsS0FBSyxTQUFTLENBQUMsRUFBRSxNQUFNLEdBQ3hDO0FBQ0QsV0FBSyx1QkFBdUIsRUFBRSxNQUFNLEtBQUsscUJBQXFCLE1BQU0sUUFBUSxLQUFLLHFCQUFxQixTQUFTLEVBQUU7QUFDakgsY0FBUSxLQUFLO0FBRWIsZUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMzQyxtQkFBVyxDQUFDLEtBQUssY0FBYztBQUFBLE1BQ2hDO0FBRUEsV0FBSyxTQUFTLENBQUMsRUFBRSxhQUF3QixLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVksT0FBaUIsV0FBVyxNQUFNLENBQUMsQ0FBQztBQUMxRyxXQUFLLFNBQVMsQ0FBQyxFQUFFLFVBQVUsTUFBTTtBQUNqQyxxQkFBZTtBQUFBLElBQ2hCLE9BQU87QUFDTixVQUFJLGdCQUFnQixHQUFHO0FBQ3RCLGlCQUFTLElBQUksR0FBRyxJQUFJLFdBQVcsUUFBUSxLQUFLO0FBQzNDLHFCQUFXLENBQUMsS0FBSztBQUFBLFFBQ2xCO0FBQUEsTUFDRDtBQUNBLFdBQUssU0FBUyxDQUFDLEVBQUUsYUFBd0IsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFZLE9BQWlCLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDMUcsV0FBSyxTQUFTLENBQUMsRUFBRSxVQUFVO0FBQUEsSUFDNUI7QUFFQSxVQUFNLFlBQVksS0FBSyxTQUFTLENBQUMsRUFBRSxPQUFPO0FBQzFDLFVBQU0sV0FBVyxLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVcsU0FBUztBQUN0RCxVQUFNLFlBQVksWUFBWSxLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVcsUUFBUTtBQUNsRSxVQUFNLFNBQVMsRUFBRSxNQUFNLFVBQVUsUUFBUSxVQUFVO0FBQ25ELFVBQU0sV0FBVyxJQUFJO0FBQUEsTUFDcEI7QUFBQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxLQUFLLGVBQWUsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwQyxZQUFZO0FBQUEsSUFDYjtBQUNBLFNBQUssdUJBQXVCO0FBQzVCLFdBQU8sQ0FBQyxRQUFRO0FBQUEsRUFDakI7QUFBQSxFQUVPLHFCQUE2QjtBQUNuQyxXQUFPLEtBQUssb0JBQW9CLEtBQUssSUFBSTtBQUFBLEVBQzFDO0FBQUEsRUFFTyxrQkFBa0IsWUFBb0IsWUFBb0IsR0FBVztBQUMzRSxRQUFJLElBQUksS0FBSztBQUViLFFBQUksTUFBTTtBQUNWLFVBQU0sUUFBUSxLQUFLLGFBQWEsS0FBSyxVQUFVO0FBQy9DLFFBQUksT0FBTztBQUNWLFVBQUksTUFBTTtBQUNWLFlBQU0sdUJBQXVCLEtBQUssb0JBQW9CLEdBQUcsYUFBYSxNQUFNLHNCQUFzQixDQUFDO0FBQ25HLFlBQU0sU0FBUyxLQUFLLFNBQVMsRUFBRSxNQUFNLFdBQVcsRUFBRTtBQUNsRCxZQUFNLGNBQWMsS0FBSyxlQUFlLEVBQUUsTUFBTSxhQUFhLEVBQUUsTUFBTSxLQUFLO0FBQzFFLFVBQUksTUFBTSxzQkFBc0IsRUFBRSxNQUFNLGdCQUFnQixZQUFZO0FBQ25FLGNBQU0sT0FBTyxVQUFVLGNBQWMsc0JBQXNCLGNBQWMsRUFBRSxNQUFNLE1BQU07QUFBQSxNQUN4RixPQUFPO0FBQ04sY0FBTSxtQkFBbUIsS0FBSyxvQkFBb0IsR0FBRyxhQUFhLE1BQU0sbUJBQW1CO0FBQzNGLGVBQU8sT0FBTyxVQUFVLGNBQWMsc0JBQXNCLGNBQWMsbUJBQW1CLFNBQVM7QUFBQSxNQUN2RztBQUFBLElBQ0QsT0FBTztBQUNOLFVBQUksa0JBQWtCO0FBQ3RCLFlBQU0scUJBQXFCO0FBQzNCLGFBQU8sTUFBTSxVQUFVO0FBQ3RCLFlBQUksRUFBRSxTQUFTLFlBQVksRUFBRSxXQUFXLGFBQWEsR0FBRztBQUN2RCxjQUFJLEVBQUU7QUFBQSxRQUNQLFdBQVcsRUFBRSxVQUFVLEVBQUUsTUFBTSxjQUFjLGFBQWEsR0FBRztBQUM1RCxnQkFBTSx1QkFBdUIsS0FBSyxvQkFBb0IsR0FBRyxhQUFhLEVBQUUsVUFBVSxDQUFDO0FBQ25GLGdCQUFNLG1CQUFtQixLQUFLLG9CQUFvQixHQUFHLGFBQWEsRUFBRSxVQUFVLENBQUM7QUFDL0UsZ0JBQU0sU0FBUyxLQUFLLFNBQVMsRUFBRSxNQUFNLFdBQVcsRUFBRTtBQUNsRCxnQkFBTSxjQUFjLEtBQUssZUFBZSxFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sS0FBSztBQUMxRSw2QkFBbUIsRUFBRTtBQUNyQixlQUFLLGFBQWEsSUFBSTtBQUFBLFlBQ3JCLE1BQU07QUFBQSxZQUNOO0FBQUEsWUFDQSxxQkFBcUIsc0JBQXNCLGFBQWEsSUFBSSxFQUFFO0FBQUEsVUFDL0QsQ0FBQztBQUVELGlCQUFPLE9BQU8sVUFBVSxjQUFjLHNCQUFzQixjQUFjLG1CQUFtQixTQUFTO0FBQUEsUUFDdkcsV0FBVyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixhQUFhLEdBQUc7QUFDOUQsZ0JBQU0sdUJBQXVCLEtBQUssb0JBQW9CLEdBQUcsYUFBYSxFQUFFLFVBQVUsQ0FBQztBQUNuRixnQkFBTSxTQUFTLEtBQUssU0FBUyxFQUFFLE1BQU0sV0FBVyxFQUFFO0FBQ2xELGdCQUFNLGNBQWMsS0FBSyxlQUFlLEVBQUUsTUFBTSxhQUFhLEVBQUUsTUFBTSxLQUFLO0FBRTFFLGdCQUFNLE9BQU8sVUFBVSxjQUFjLHNCQUFzQixjQUFjLEVBQUUsTUFBTSxNQUFNO0FBQ3ZGO0FBQUEsUUFDRCxPQUFPO0FBQ04sd0JBQWMsRUFBRSxVQUFVLEVBQUUsTUFBTTtBQUNsQyw2QkFBbUIsRUFBRSxZQUFZLEVBQUUsTUFBTTtBQUN6QyxjQUFJLEVBQUU7QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLEVBQUUsS0FBSztBQUNYLFdBQU8sTUFBTSxVQUFVO0FBQ3RCLFlBQU0sU0FBUyxLQUFLLFNBQVMsRUFBRSxNQUFNLFdBQVcsRUFBRTtBQUVsRCxVQUFJLEVBQUUsTUFBTSxjQUFjLEdBQUc7QUFDNUIsY0FBTSxtQkFBbUIsS0FBSyxvQkFBb0IsR0FBRyxDQUFDO0FBQ3RELGNBQU0sY0FBYyxLQUFLLGVBQWUsRUFBRSxNQUFNLGFBQWEsRUFBRSxNQUFNLEtBQUs7QUFFMUUsZUFBTyxPQUFPLFVBQVUsYUFBYSxjQUFjLG1CQUFtQixTQUFTO0FBQy9FLGVBQU87QUFBQSxNQUNSLE9BQU87QUFDTixjQUFNLGNBQWMsS0FBSyxlQUFlLEVBQUUsTUFBTSxhQUFhLEVBQUUsTUFBTSxLQUFLO0FBQzFFLGVBQU8sT0FBTyxPQUFPLGFBQWEsRUFBRSxNQUFNLE1BQU07QUFBQSxNQUNqRDtBQUVBLFVBQUksRUFBRSxLQUFLO0FBQUEsSUFDWjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx3QkFBd0I7QUFDL0IsUUFBSSxJQUFJLEtBQUs7QUFFYixRQUFJLFFBQVE7QUFDWixRQUFJLE1BQU07QUFFVixXQUFPLE1BQU0sVUFBVTtBQUN0QixlQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU07QUFDN0IsYUFBTyxFQUFFLFlBQVksRUFBRSxNQUFNO0FBQzdCLFVBQUksRUFBRTtBQUFBLElBQ1A7QUFFQSxTQUFLLFdBQVc7QUFDaEIsU0FBSyxVQUFVO0FBQ2YsU0FBSyxhQUFhLFNBQVMsS0FBSyxPQUFPO0FBQUEsRUFDeEM7QUFBQTtBQUFBLEVBR1EsV0FBVyxNQUFnQixrQkFBZ0U7QUFDbEcsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxNQUFNLEtBQUssaUJBQWlCLE1BQU0sZ0JBQWdCO0FBQ3hELFVBQU0sVUFBVSxJQUFJLE9BQU8sTUFBTSxNQUFNO0FBRXZDLFFBQUksS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNLEdBQUcsSUFBSSxLQUFLLGVBQWUsTUFBTSxhQUFhLE1BQU0sS0FBSyxNQUFNLGtCQUFrQjtBQUVqSSxZQUFNLGNBQWMsS0FBSyxlQUFlLEtBQUssTUFBTSxhQUFhLE1BQU0sT0FBTyxHQUFHO0FBQ2hGLFVBQUksZ0JBQWdCLFNBQVM7QUFFNUIsZUFBTyxFQUFFLE9BQU8sYUFBYSxXQUFXLEVBQUU7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFFQSxXQUFPLEVBQUUsT0FBTyxTQUFTLFdBQVcsSUFBSSxPQUFPO0FBQUEsRUFDaEQ7QUFBQSxFQUVRLG9CQUFvQixNQUFnQixPQUFlO0FBQzFELFFBQUksUUFBUSxHQUFHO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsS0FBSztBQUNuQixVQUFNLGFBQWEsS0FBSyxTQUFTLE1BQU0sV0FBVyxFQUFFO0FBQ3BELFVBQU0seUJBQXlCLE1BQU0sTUFBTSxPQUFPLFFBQVE7QUFDMUQsUUFBSSx5QkFBeUIsTUFBTSxJQUFJLE1BQU07QUFDNUMsYUFBTyxXQUFXLE1BQU0sSUFBSSxJQUFJLElBQUksTUFBTSxJQUFJLFNBQVMsV0FBVyxNQUFNLE1BQU0sSUFBSSxJQUFJLE1BQU0sTUFBTTtBQUFBLElBQ25HLE9BQU87QUFDTixhQUFPLFdBQVcsc0JBQXNCLElBQUksV0FBVyxNQUFNLE1BQU0sSUFBSSxJQUFJLE1BQU0sTUFBTTtBQUFBLElBQ3hGO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxNQUFnQixLQUFtQjtBQUN6RCxVQUFNLFFBQVEsS0FBSztBQUNuQixVQUFNLGdCQUFnQixNQUFNO0FBQzVCLFVBQU0sb0JBQW9CLEtBQUssZUFBZSxNQUFNLGFBQWEsTUFBTSxHQUFHO0FBRTFFLFVBQU0sU0FBUztBQUNmLFVBQU0sZUFBZSxLQUFLLGVBQWUsTUFBTSxhQUFhLE1BQU07QUFDbEUsVUFBTSxpQkFBaUIsS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNLE9BQU8sTUFBTTtBQUVqRixVQUFNLFdBQVcsaUJBQWlCO0FBQ2xDLFVBQU0sYUFBYSxlQUFlO0FBQ2xDLFVBQU0sWUFBWSxNQUFNLFNBQVM7QUFFakMsU0FBSyxRQUFRLElBQUk7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLHVCQUFtQixNQUFNLE1BQU0sWUFBWSxRQUFRO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLGVBQWUsTUFBZ0IsS0FBbUI7QUFDekQsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxnQkFBZ0IsTUFBTTtBQUM1QixVQUFNLHNCQUFzQixLQUFLLGVBQWUsTUFBTSxhQUFhLE1BQU0sS0FBSztBQUU5RSxVQUFNLFdBQVc7QUFDakIsVUFBTSxpQkFBaUIsS0FBSyxlQUFlLE1BQU0sYUFBYSxVQUFVLE1BQU0sR0FBRztBQUNqRixVQUFNLGlCQUFpQixLQUFLLGVBQWUsTUFBTSxhQUFhLFFBQVE7QUFDdEUsVUFBTSxXQUFXLGlCQUFpQjtBQUNsQyxVQUFNLGFBQWEsc0JBQXNCO0FBQ3pDLFVBQU0sWUFBWSxNQUFNLFNBQVM7QUFDakMsU0FBSyxRQUFRLElBQUk7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLHVCQUFtQixNQUFNLE1BQU0sWUFBWSxRQUFRO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLFdBQVcsTUFBZ0IsT0FBcUIsS0FBbUI7QUFDMUUsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxtQkFBbUIsTUFBTTtBQUMvQixVQUFNLGlCQUFpQixNQUFNO0FBRzdCLFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFVBQU0sV0FBVyxNQUFNO0FBQ3ZCLFVBQU0sU0FBUztBQUNmLFVBQU0saUJBQWlCLEtBQUssZUFBZSxNQUFNLGFBQWEsTUFBTSxPQUFPLE1BQU07QUFDakYsVUFBTSxZQUFZLEtBQUssZUFBZSxNQUFNLGFBQWEsS0FBSyxJQUFJLEtBQUssZUFBZSxNQUFNLGFBQWEsZ0JBQWdCO0FBRXpILFNBQUssUUFBUSxJQUFJO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSx1QkFBbUIsTUFBTSxNQUFNLFlBQVksV0FBVyxpQkFBaUIsUUFBUTtBQUcvRSxVQUFNLFdBQVcsSUFBSTtBQUFBLE1BQ3BCLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSyxlQUFlLE1BQU0sYUFBYSxLQUFLLGNBQWM7QUFBQSxNQUMxRCxLQUFLLGVBQWUsTUFBTSxhQUFhLGNBQWMsSUFBSSxLQUFLLGVBQWUsTUFBTSxhQUFhLEdBQUc7QUFBQSxJQUNwRztBQUVBLFVBQU0sVUFBVSxLQUFLLGNBQWMsTUFBTSxRQUFRO0FBQ2pELFNBQUsseUJBQXlCLE9BQU87QUFBQSxFQUN0QztBQUFBLEVBRVEsYUFBYSxNQUFnQixPQUFxQjtBQUN6RCxRQUFJLEtBQUssNkJBQTZCLE9BQU8sSUFBSSxHQUFHO0FBQ25ELGVBQVM7QUFBQSxJQUNWO0FBRUEsVUFBTSxVQUFVLEtBQUssZ0JBQWdCLEtBQUssS0FBSyxZQUFZLEtBQUssS0FBSyxLQUFLLFVBQVUsSUFBSTtBQUN4RixVQUFNLGNBQWMsS0FBSyxTQUFTLENBQUMsRUFBRSxPQUFPO0FBQzVDLFNBQUssU0FBUyxDQUFDLEVBQUUsVUFBVTtBQUMzQixVQUFNLGFBQWEscUJBQXFCLE9BQU8sS0FBSztBQUNwRCxhQUFTLElBQUksR0FBRyxJQUFJLFdBQVcsUUFBUSxLQUFLO0FBQzNDLGlCQUFXLENBQUMsS0FBSztBQUFBLElBQ2xCO0FBQ0EsUUFBSSxTQUFTO0FBQ1osWUFBTSxrQkFBa0IsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFXLEtBQUssU0FBUyxDQUFDLEVBQUUsV0FBVyxTQUFTLENBQUM7QUFDMUYsTUFBVyxLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVksSUFBSTtBQUU1QyxXQUFLLHVCQUF1QixFQUFFLE1BQU0sS0FBSyxxQkFBcUIsT0FBTyxHQUFHLFFBQVEsY0FBYyxnQkFBZ0I7QUFBQSxJQUMvRztBQUVBLFNBQUssU0FBUyxDQUFDLEVBQUUsYUFBd0IsS0FBSyxTQUFTLENBQUMsRUFBRSxXQUFZLE9BQWlCLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDMUcsVUFBTSxXQUFXLEtBQUssU0FBUyxDQUFDLEVBQUUsV0FBVyxTQUFTO0FBQ3RELFVBQU0sWUFBWSxLQUFLLFNBQVMsQ0FBQyxFQUFFLE9BQU8sU0FBUyxLQUFLLFNBQVMsQ0FBQyxFQUFFLFdBQVcsUUFBUTtBQUN2RixVQUFNLFNBQVMsRUFBRSxNQUFNLFVBQVUsUUFBUSxVQUFVO0FBQ25ELFVBQU0sWUFBWSxLQUFLLE1BQU0sU0FBUyxNQUFNO0FBQzVDLFVBQU0saUJBQWlCLEtBQUssTUFBTTtBQUNsQyxVQUFNLGlCQUFpQixLQUFLLGVBQWUsR0FBRyxLQUFLLE1BQU0sT0FBTyxNQUFNO0FBQ3RFLFVBQU0sV0FBVyxpQkFBaUI7QUFFbEMsU0FBSyxRQUFRLElBQUk7QUFBQSxNQUNoQixLQUFLLE1BQU07QUFBQSxNQUNYLEtBQUssTUFBTTtBQUFBLE1BQ1g7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSxTQUFLLHVCQUF1QjtBQUM1Qix1QkFBbUIsTUFBTSxNQUFNLE1BQU0sUUFBUSxRQUFRO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLE9BQU8sUUFBOEI7QUFDNUMsUUFBSSxJQUFJLEtBQUs7QUFDYixVQUFNLFFBQVEsS0FBSyxhQUFhLElBQUksTUFBTTtBQUMxQyxRQUFJLE9BQU87QUFDVixhQUFPO0FBQUEsUUFDTixNQUFNLE1BQU07QUFBQSxRQUNaLGlCQUFpQixNQUFNO0FBQUEsUUFDdkIsV0FBVyxTQUFTLE1BQU07QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLGtCQUFrQjtBQUV0QixXQUFPLE1BQU0sVUFBVTtBQUN0QixVQUFJLEVBQUUsWUFBWSxRQUFRO0FBQ3pCLFlBQUksRUFBRTtBQUFBLE1BQ1AsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLFVBQVUsUUFBUTtBQUNsRCwyQkFBbUIsRUFBRTtBQUNyQixjQUFNLE1BQU07QUFBQSxVQUNYLE1BQU07QUFBQSxVQUNOLFdBQVcsU0FBUyxFQUFFO0FBQUEsVUFDdEI7QUFBQSxRQUNEO0FBQ0EsYUFBSyxhQUFhLElBQUksR0FBRztBQUN6QixlQUFPO0FBQUEsTUFDUixPQUFPO0FBQ04sa0JBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTTtBQUNoQywyQkFBbUIsRUFBRSxZQUFZLEVBQUUsTUFBTTtBQUN6QyxZQUFJLEVBQUU7QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxRQUFRLFlBQW9CLFFBQThCO0FBQ2pFLFFBQUksSUFBSSxLQUFLO0FBQ2IsUUFBSSxrQkFBa0I7QUFFdEIsV0FBTyxNQUFNLFVBQVU7QUFDdEIsVUFBSSxFQUFFLFNBQVMsWUFBWSxFQUFFLFdBQVcsYUFBYSxHQUFHO0FBQ3ZELFlBQUksRUFBRTtBQUFBLE1BQ1AsV0FBVyxFQUFFLFVBQVUsRUFBRSxNQUFNLGNBQWMsYUFBYSxHQUFHO0FBQzVELGNBQU0sdUJBQXVCLEtBQUssb0JBQW9CLEdBQUcsYUFBYSxFQUFFLFVBQVUsQ0FBQztBQUNuRixjQUFNLG1CQUFtQixLQUFLLG9CQUFvQixHQUFHLGFBQWEsRUFBRSxVQUFVLENBQUM7QUFDL0UsMkJBQW1CLEVBQUU7QUFFckIsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sV0FBVyxLQUFLLElBQUksdUJBQXVCLFNBQVMsR0FBRyxnQkFBZ0I7QUFBQSxVQUN2RTtBQUFBLFFBQ0Q7QUFBQSxNQUNELFdBQVcsRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsYUFBYSxHQUFHO0FBQzlELGNBQU0sdUJBQXVCLEtBQUssb0JBQW9CLEdBQUcsYUFBYSxFQUFFLFVBQVUsQ0FBQztBQUNuRixZQUFJLHVCQUF1QixTQUFTLEtBQUssRUFBRSxNQUFNLFFBQVE7QUFDeEQsaUJBQU87QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLFdBQVcsdUJBQXVCLFNBQVM7QUFBQSxZQUMzQztBQUFBLFVBQ0Q7QUFBQSxRQUNELE9BQU87QUFDTixvQkFBVSxFQUFFLE1BQU0sU0FBUztBQUMzQjtBQUFBLFFBQ0Q7QUFBQSxNQUNELE9BQU87QUFDTixzQkFBYyxFQUFFLFVBQVUsRUFBRSxNQUFNO0FBQ2xDLDJCQUFtQixFQUFFLFlBQVksRUFBRSxNQUFNO0FBQ3pDLFlBQUksRUFBRTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBR0EsUUFBSSxFQUFFLEtBQUs7QUFDWCxXQUFPLE1BQU0sVUFBVTtBQUV0QixVQUFJLEVBQUUsTUFBTSxjQUFjLEdBQUc7QUFDNUIsY0FBTSxtQkFBbUIsS0FBSyxvQkFBb0IsR0FBRyxDQUFDO0FBQ3RELGNBQU1DLG1CQUFrQixLQUFLLGFBQWEsQ0FBQztBQUMzQyxlQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixXQUFXLEtBQUssSUFBSSxTQUFTLEdBQUcsZ0JBQWdCO0FBQUEsVUFDaEQsaUJBQUFBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsT0FBTztBQUNOLFlBQUksRUFBRSxNQUFNLFVBQVUsU0FBUyxHQUFHO0FBQ2pDLGdCQUFNQSxtQkFBa0IsS0FBSyxhQUFhLENBQUM7QUFDM0MsaUJBQU87QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLFdBQVcsU0FBUztBQUFBLFlBQ3BCLGlCQUFBQTtBQUFBLFVBQ0Q7QUFBQSxRQUNELE9BQU87QUFDTixvQkFBVSxFQUFFLE1BQU07QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLEVBQUUsS0FBSztBQUFBLElBQ1o7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZUFBZSxNQUFnQixRQUF3QjtBQUM5RCxRQUFJLEtBQUssTUFBTSxjQUFjLEdBQUc7QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFNBQVMsS0FBSyxTQUFTLEtBQUssTUFBTSxXQUFXO0FBQ25ELFVBQU0sWUFBWSxLQUFLLGVBQWUsS0FBSyxNQUFNLGFBQWEsS0FBSyxNQUFNLEtBQUssSUFBSTtBQUNsRixXQUFPLE9BQU8sT0FBTyxXQUFXLFNBQVM7QUFBQSxFQUMxQztBQUFBLEVBRVEsYUFBYSxNQUF3QjtBQUM1QyxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxNQUFNLEtBQUs7QUFDZixXQUFPLFNBQVMsS0FBSyxNQUFNO0FBQzFCLFVBQUksS0FBSyxPQUFPLFVBQVUsTUFBTTtBQUMvQixlQUFPLEtBQUssT0FBTyxZQUFZLEtBQUssT0FBTyxNQUFNO0FBQUEsTUFDbEQ7QUFFQSxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUEsRUFLUSxrQkFBa0I7QUFDekIsV0FBTyxFQUFFLEtBQUssa0JBQWtCLEtBQUssU0FBUztBQUFBLEVBQy9DO0FBQUEsRUFFUSxZQUFZLEtBQWlDO0FBQ3BELFFBQUksT0FBTyxRQUFRLFVBQVU7QUFDNUIsYUFBTyxJQUFJLFdBQVcsQ0FBQyxNQUFNO0FBQUEsSUFDOUI7QUFFQSxRQUFJLFFBQVEsWUFBWSxJQUFJLE1BQU0sZ0JBQWdCLEdBQUc7QUFDcEQsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFFBQVEsSUFBSTtBQUNsQixVQUFNLGFBQWEsS0FBSyxTQUFTLE1BQU0sV0FBVyxFQUFFO0FBQ3BELFVBQU0sT0FBTyxNQUFNLE1BQU07QUFDekIsVUFBTSxjQUFjLFdBQVcsSUFBSSxJQUFJLE1BQU0sTUFBTTtBQUNuRCxRQUFJLFNBQVMsV0FBVyxTQUFTLEdBQUc7QUFFbkMsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGlCQUFpQixXQUFXLE9BQU8sQ0FBQztBQUMxQyxRQUFJLGlCQUFpQixjQUFjLEdBQUc7QUFDckMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssU0FBUyxNQUFNLFdBQVcsRUFBRSxPQUFPLFdBQVcsV0FBVyxNQUFNO0FBQUEsRUFDNUU7QUFBQSxFQUVRLFVBQVUsS0FBaUM7QUFDbEQsUUFBSSxPQUFPLFFBQVEsVUFBVTtBQUM1QixhQUFPLElBQUksV0FBVyxJQUFJLFNBQVMsQ0FBQyxNQUFNO0FBQUEsSUFDM0M7QUFFQSxRQUFJLFFBQVEsWUFBWSxJQUFJLE1BQU0sZ0JBQWdCLEdBQUc7QUFDcEQsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssZUFBZSxLQUFLLElBQUksTUFBTSxTQUFTLENBQUMsTUFBTTtBQUFBLEVBQzNEO0FBQUEsRUFFUSx5QkFBeUIsVUFBb0I7QUFDcEQsUUFBSSxLQUFLLGdCQUFnQixLQUFLLEtBQUssWUFBWSxRQUFRLEdBQUc7QUFDekQsWUFBTSxPQUFPLFNBQVMsS0FBSztBQUMzQixVQUFJLEtBQUssVUFBVSxJQUFJLEdBQUc7QUFDekIsYUFBSyxRQUFRLE1BQU0sUUFBUTtBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixNQUFnQjtBQUNoRCxRQUFJLEtBQUssZ0JBQWdCLEtBQUssS0FBSyxVQUFVLElBQUksR0FBRztBQUNuRCxZQUFNLFdBQVcsS0FBSyxLQUFLO0FBQzNCLFVBQUksS0FBSyxZQUFZLFFBQVEsR0FBRztBQUMvQixhQUFLLFFBQVEsTUFBTSxRQUFRO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsUUFBUSxNQUFnQixNQUFnQjtBQUMvQyxVQUFNLGFBQXlCLENBQUM7QUFFaEMsVUFBTSxhQUFhLEtBQUssU0FBUyxLQUFLLE1BQU0sV0FBVyxFQUFFO0FBQ3pELFFBQUk7QUFDSixRQUFJLEtBQUssTUFBTSxJQUFJLFdBQVcsR0FBRztBQUVoQyxlQUFTLEVBQUUsTUFBTSxLQUFLLE1BQU0sSUFBSSxPQUFPLEdBQUcsUUFBUSxXQUFXLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxXQUFXLEtBQUssTUFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUU7QUFBQSxJQUM3SCxPQUFPO0FBRU4sZUFBUyxFQUFFLE1BQU0sS0FBSyxNQUFNLElBQUksTUFBTSxRQUFRLEtBQUssTUFBTSxJQUFJLFNBQVMsRUFBRTtBQUFBLElBQ3pFO0FBRUEsVUFBTSxnQkFBZ0IsS0FBSyxNQUFNLFNBQVM7QUFDMUMsVUFBTSxlQUFlLEtBQUssTUFBTSxjQUFjO0FBQzlDLFNBQUssUUFBUSxJQUFJO0FBQUEsTUFDaEIsS0FBSyxNQUFNO0FBQUEsTUFDWCxLQUFLLE1BQU07QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsdUJBQW1CLE1BQU0sTUFBTSxJQUFJLEVBQUU7QUFDckMsUUFBSSxLQUFLLE1BQU0sV0FBVyxHQUFHO0FBQzVCLGlCQUFXLEtBQUssSUFBSTtBQUFBLElBQ3JCO0FBR0EsVUFBTSxXQUF5QixFQUFFLE1BQU0sS0FBSyxNQUFNLE1BQU0sT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUM1RSxVQUFNLFlBQVksS0FBSyxNQUFNLFNBQVM7QUFDdEMsVUFBTSxpQkFBaUIsS0FBSyxlQUFlLEtBQUssTUFBTSxhQUFhLFVBQVUsS0FBSyxNQUFNLEdBQUc7QUFDM0YsU0FBSyxRQUFRLElBQUk7QUFBQSxNQUNoQixLQUFLLE1BQU07QUFBQSxNQUNYO0FBQUEsTUFDQSxLQUFLLE1BQU07QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSx1QkFBbUIsTUFBTSxNQUFNLElBQUksRUFBRTtBQUNyQyxRQUFJLEtBQUssTUFBTSxXQUFXLEdBQUc7QUFDNUIsaUJBQVcsS0FBSyxJQUFJO0FBQUEsSUFDckI7QUFHQSxVQUFNLFNBQVMsS0FBSyxnQkFBZ0IsTUFBTTtBQUMxQyxTQUFLLGNBQWMsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUdsQyxhQUFTLElBQUksR0FBRyxJQUFJLFdBQVcsUUFBUSxLQUFLO0FBQzNDLGVBQVMsTUFBTSxXQUFXLENBQUMsQ0FBQztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRVEsNkJBQTZCLE9BQWUsTUFBeUI7QUFDNUUsUUFBSSxLQUFLLGdCQUFnQixLQUFLLEtBQUssVUFBVSxLQUFLLEdBQUc7QUFDcEQsWUFBTSxXQUFXLEtBQUssS0FBSztBQUMzQixVQUFJLEtBQUssWUFBWSxRQUFRLEdBQUc7QUFFL0IsaUJBQVM7QUFFVCxZQUFJLFNBQVMsTUFBTSxXQUFXLEdBQUc7QUFDaEMsbUJBQVMsTUFBTSxRQUFRO0FBQUEsUUFDeEIsT0FBTztBQUVOLGdCQUFNLFFBQVEsU0FBUztBQUN2QixnQkFBTSxXQUF5QixFQUFFLE1BQU0sTUFBTSxNQUFNLE9BQU8sR0FBRyxRQUFRLEVBQUU7QUFDdkUsZ0JBQU0sWUFBWSxNQUFNLFNBQVM7QUFDakMsZ0JBQU0saUJBQWlCLEtBQUssZUFBZSxNQUFNLGFBQWEsVUFBVSxNQUFNLEdBQUc7QUFDakYsbUJBQVMsUUFBUSxJQUFJO0FBQUEsWUFDcEIsTUFBTTtBQUFBLFlBQ047QUFBQSxZQUNBLE1BQU07QUFBQSxZQUNOO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFFQSw2QkFBbUIsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLFFBQzFDO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLFFBQVEsTUFBZ0IsVUFBZ0Q7QUFDdkUsUUFBSSxTQUFTLFVBQVU7QUFDdEIsYUFBTyxTQUFTLFFBQVE7QUFBQSxJQUN6QjtBQUVBLFVBQU0sVUFBVSxLQUFLLFFBQVEsS0FBSyxNQUFNLFFBQVE7QUFDaEQsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sU0FBUyxJQUFJLEtBQUssS0FBSyxRQUFRLEtBQUssT0FBTyxRQUFRO0FBQUEsRUFDM0Q7QUFBQSxFQUVRLGVBQWUsTUFBZ0I7QUFDdEMsUUFBSSxTQUFTLFVBQVU7QUFDdEIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFNBQVMsS0FBSyxTQUFTLEtBQUssTUFBTSxXQUFXO0FBQ25ELFVBQU0sUUFBUSxLQUFLO0FBQ25CLFVBQU0sY0FBYyxLQUFLLGVBQWUsTUFBTSxhQUFhLE1BQU0sS0FBSztBQUN0RSxVQUFNLFlBQVksS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNLEdBQUc7QUFDbEUsVUFBTSxpQkFBaUIsT0FBTyxPQUFPLFVBQVUsYUFBYSxTQUFTO0FBQ3JFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxnQkFBZ0IsT0FBYztBQUM3QixVQUFNLFNBQVMsS0FBSyxTQUFTLE1BQU0sV0FBVztBQUM5QyxVQUFNLGNBQWMsS0FBSyxlQUFlLE1BQU0sYUFBYSxNQUFNLEtBQUs7QUFDdEUsVUFBTSxZQUFZLEtBQUssZUFBZSxNQUFNLGFBQWEsTUFBTSxHQUFHO0FBQ2xFLFVBQU0saUJBQWlCLE9BQU8sT0FBTyxVQUFVLGFBQWEsU0FBUztBQUNyRSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTUSxjQUFjLE1BQXVCLEdBQW9CO0FBQ2hFLFVBQU0sSUFBSSxJQUFJLFNBQVMsR0FBRyxVQUFVLEdBQUc7QUFDdkMsTUFBRSxPQUFPO0FBQ1QsTUFBRSxRQUFRO0FBQ1YsTUFBRSxTQUFTO0FBQ1gsTUFBRSxZQUFZO0FBQ2QsTUFBRSxVQUFVO0FBRVosVUFBTSxJQUFJLEtBQUs7QUFDZixRQUFJLE1BQU0sVUFBVTtBQUNuQixXQUFLLE9BQU87QUFDWixRQUFFLFFBQVEsVUFBVTtBQUFBLElBQ3JCLFdBQVcsS0FBTSxVQUFVLFVBQVU7QUFDcEMsV0FBTSxRQUFRO0FBQ2QsUUFBRSxTQUFTO0FBQUEsSUFDWixPQUFPO0FBQ04sWUFBTSxXQUFXLFFBQVEsS0FBTSxLQUFLO0FBQ3BDLGVBQVMsT0FBTztBQUNoQixRQUFFLFNBQVM7QUFBQSxJQUNaO0FBRUEsY0FBVSxNQUFNLENBQUM7QUFDakIsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1EsYUFBYSxNQUF1QixHQUFvQjtBQUMvRCxVQUFNLElBQUksSUFBSSxTQUFTLEdBQUcsVUFBVSxHQUFHO0FBQ3ZDLE1BQUUsT0FBTztBQUNULE1BQUUsUUFBUTtBQUNWLE1BQUUsU0FBUztBQUNYLE1BQUUsWUFBWTtBQUNkLE1BQUUsVUFBVTtBQUVaLFFBQUksS0FBSyxTQUFTLFVBQVU7QUFDM0IsV0FBSyxPQUFPO0FBQ1osUUFBRSxRQUFRLFVBQVU7QUFBQSxJQUNyQixXQUFXLEtBQU0sU0FBUyxVQUFVO0FBQ25DLFdBQU0sT0FBTztBQUNiLFFBQUUsU0FBUztBQUFBLElBQ1osT0FBTztBQUNOLFlBQU0sV0FBVyxVQUFVLEtBQU0sSUFBSTtBQUNyQyxlQUFTLFFBQVE7QUFDakIsUUFBRSxTQUFTO0FBQUEsSUFDWjtBQUVBLGNBQVUsTUFBTSxDQUFDO0FBQ2pCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxvQkFBb0IsTUFBd0I7QUFDbkQsUUFBSSxNQUFNO0FBRVYsU0FBSyxRQUFRLE1BQU0sQ0FBQUMsVUFBUTtBQUMxQixhQUFPLEtBQUssZUFBZUEsS0FBSTtBQUMvQixhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUVEOyIsCiAgIm5hbWVzIjogWyJidWZmZXIiLCAic3RhcnRPZmZzZXQiLCAic3RhcnRDb2x1bW4iLCAic3RhcnRTcGxpdFBvc0luQnVmZmVyIiwgImVuZFNwbGl0UG9zSW5CdWZmZXIiLCAibGluZVN0YXJ0cyIsICJub2RlU3RhcnRPZmZzZXQiLCAibm9kZSJdCn0K
